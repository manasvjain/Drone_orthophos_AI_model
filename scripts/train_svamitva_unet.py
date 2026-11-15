"""
SVAMITVA AI — PyTorch U-Net (ResNet-18) Training Script
Dataset: https://www.kaggle.com/datasets/utkarshsaxenadn/svamitva-drone-aerial-images

Produces `final_drone_model.pth` compatible with public/assets/aistudio/app_3c61c556.py:
  Classes: 0 = Background, 1 = Building, 2 = Vegetation, 3 = Water, 4 = Road

Usage (Colab / Kaggle / Local GPU):
  pip install torch torchvision segmentation-models-pytorch albumentations opencv-python pillow kagglehub tqdm
  python scripts/train_svamitva_unet.py --epochs 40 --batch-size 16 --tile-size 256
  # Or point directly at an already-downloaded folder:
  python scripts/train_svamitva_unet.py --data-dir /path/to/svamitva-drone-aerial-images
"""

import argparse
from pathlib import Path
import random
import sys

import albumentations as A
from albumentations.pytorch import ToTensorV2
import cv2
import numpy as np
import segmentation_models_pytorch as smp
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

CLASS_LABELS = np.array([0, 1, 2, 3, 4], dtype=np.uint8)
NUM_CLASSES = 5
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}


def resolve_dataset_root(data_dir: str | None) -> Path:
    if data_dir:
        root = Path(data_dir).expanduser().resolve()
        if not root.exists():
            raise FileNotFoundError(f"Dataset directory not found: {root}")
        return root

    try:
        import kagglehub  # type: ignore

        print("Downloading utkarshsaxenadn/svamitva-drone-aerial-images via kagglehub...")
        path = kagglehub.dataset_download("utkarshsaxenadn/svamitva-drone-aerial-images")
        return Path(path)
    except Exception as exc:
        print(
            "Automatic kagglehub download failed. Pass --data-dir <local_folder> or configure Kaggle credentials.\n"
            f"Details: {exc}",
            file=sys.stderr,
        )
        raise


def discover_image_mask_pairs(root: Path) -> list[tuple[Path, Path]]:
    all_files = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTS]
    image_candidates: dict[str, Path] = {}
    mask_candidates: dict[str, Path] = {}

    for p in all_files:
        rel_lower = str(p.relative_to(root)).lower()
        stem = p.stem.lower()
        clean_stem = stem.replace("_mask", "").replace("-mask", "").replace("_label", "")

        if "mask" in rel_lower or "label" in rel_lower or "gt" in rel_lower:
            mask_candidates[clean_stem] = p
        else:
            image_candidates[clean_stem] = p

    pairs: list[tuple[Path, Path]] = []
    for stem, img_path in sorted(image_candidates.items()):
        if stem in mask_candidates:
            pairs.append((img_path, mask_candidates[stem]))

    if not pairs:
        raise RuntimeError(
            f"No paired (image, mask) files found under {root}. Expected matching filenames inside images/ and masks/ subfolders."
        )
    return pairs


def normalize_mask_to_class_ids(raw_mask: np.ndarray) -> np.ndarray:
    """
    Normalizes either grayscale class/binary masks or RGB semantic color masks
    to SVAMITVA class IDs:
      0 = Background, 1 = Building, 2 = Vegetation, 3 = Water, 4 = Road
    """
    if raw_mask.ndim == 2:
        uniq = np.unique(raw_mask)
        # Binary building mask (0 / 255 or 0 / 1)
        if set(uniq.tolist()).issubset({0, 1, 255}):
            out = np.zeros_like(raw_mask, dtype=np.uint8)
            out[raw_mask > 0] = 1
            return out
        # Already class IDs in 0..4
        if uniq.max() <= 4:
            return raw_mask.astype(np.uint8)
        # Quantized grayscale intensities
        out = np.zeros_like(raw_mask, dtype=np.uint8)
        out[(raw_mask >= 40) & (raw_mask < 100)] = 2
        out[(raw_mask >= 100) & (raw_mask < 160)] = 3
        out[(raw_mask >= 160) & (raw_mask < 215)] = 4
        out[raw_mask >= 215] = 1
        return out

    # RGB color mask (BGR from cv2.imread -> convert to RGB)
    rgb = cv2.cvtColor(raw_mask, cv2.COLOR_BGR2RGB)
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)

    out = np.zeros(rgb.shape[:2], dtype=np.uint8)
    # Grayscale saved as 3-channel
    if np.array_equal(r, g) and np.array_equal(g, b):
        return normalize_mask_to_class_ids(rgb[:, :, 0])

    # Common remote-sensing RGB palettes:
    # Building: Red/Orange/Terracotta or White
    is_building = ((r > 150) & (g < 120) & (b < 120)) | ((r > 210) & (g > 210) & (b > 210))
    # Vegetation: Green
    is_vegetation = (g > 110) & (g > r + 25) & (g > b + 25)
    # Water: Blue/Cyan
    is_water = (b > 120) & (b > r + 25)
    # Road: Yellow/Amber/Magenta/Grey
    is_road = ((r > 160) & (g > 140) & (b < 110)) | ((r > 130) & (b > 130) & (g < 100))

    out[is_vegetation] = 2
    out[is_water] = 3
    out[is_road] = 4
    out[is_building] = 1
    return out


class TiledSvamitvaDataset(Dataset):
    def __init__(
        self,
        pairs: list[tuple[Path, Path]],
        tile_size: int = 256,
        stride: int = 192,
        transform: A.Compose | None = None,
    ):
        self.samples: list[tuple[np.ndarray, np.ndarray]] = []
        self.transform = transform

        for img_path, mask_path in pairs:
            bgr = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
            raw_mask = cv2.imread(str(mask_path), cv2.IMREAD_UNCHANGED)
            if bgr is None or raw_mask is None:
                continue
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            cls_mask = normalize_mask_to_class_ids(raw_mask)
            if cls_mask.shape[:2] != rgb.shape[:2]:
                cls_mask = cv2.resize(
                    cls_mask, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_NEAREST
                )

            h, w = rgb.shape[:2]
            pad_h = max(0, tile_size - h)
            pad_w = max(0, tile_size - w)
            if pad_h or pad_w:
                rgb = cv2.copyMakeBorder(rgb, 0, pad_h, 0, pad_w, cv2.BORDER_REFLECT_101)
                cls_mask = cv2.copyMakeBorder(
                    cls_mask, 0, pad_h, 0, pad_w, cv2.BORDER_CONSTANT, value=0
                )
                h, w = rgb.shape[:2]

            ys = list(range(0, max(1, h - tile_size + 1), stride))
            if ys[-1] != h - tile_size:
                ys.append(h - tile_size)
            xs = list(range(0, max(1, w - tile_size + 1), stride))
            if xs[-1] != w - tile_size:
                xs.append(w - tile_size)

            for y in ys:
                for x in xs:
                    tile_img = rgb[y : y + tile_size, x : x + tile_size]
                    tile_msk = cls_mask[y : y + tile_size, x : x + tile_size]
                    self.samples.append((tile_img, tile_msk))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        img, mask = self.samples[idx]
        if self.transform:
            augmented = self.transform(image=img, mask=mask)
            img_t = augmented["image"].float() / 255.0
            mask_t = augmented["mask"].long()
        else:
            img_t = torch.from_numpy(img.transpose(2, 0, 1)).float() / 255.0
            mask_t = torch.from_numpy(mask).long()
        return img_t, mask_t


def compute_batch_iou(logits: torch.Tensor, targets: torch.Tensor, num_classes: int = NUM_CLASSES):
    preds = logits.argmax(dim=1)
    ious = []
    for cls_id in range(1, num_classes):
        pred_c = preds == cls_id
        targ_c = targets == cls_id
        union = (pred_c | targ_c).sum().item()
        if union == 0:
            continue
        inter = (pred_c & targ_c).sum().item()
        ious.append(inter / union)
    return float(np.mean(ious)) if ious else 0.0


def main():
    parser = argparse.ArgumentParser(description="Train SVAMITVA AI U-Net ResNet-18 checkpoint")
    parser.add_argument("--data-dir", type=str, default=None, help="Local Kaggle dataset directory")
    parser.add_argument("--out", type=str, default="final_drone_model.pth", help="Output checkpoint path")
    parser.add_argument("--epochs", type=int, default=35)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--tile-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--val-split", type=float, default=0.15)
    args = parser.parse_args()

    dataset_root = resolve_dataset_root(args.data_dir)
    pairs = discover_image_mask_pairs(dataset_root)
    print(f"Found {len(pairs)} image/mask pairs under {dataset_root}")

    random.seed(42)
    random.shuffle(pairs)
    val_count = max(1, int(len(pairs) * args.val_split))
    val_pairs = pairs[:val_count]
    train_pairs = pairs[val_count:] or pairs

    train_tfms = A.Compose(
        [
            A.HorizontalFlip(p=0.5),
            A.VerticalFlip(p=0.5),
            A.RandomRotate90(p=0.5),
            A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.45),
            A.HueSaturationValue(hue_shift_limit=8, sat_shift_limit=15, val_shift_limit=12, p=0.35),
            ToTensorV2(),
        ]
    )
    val_tfms = A.Compose([ToTensorV2()])

    train_ds = TiledSvamitvaDataset(train_pairs, tile_size=args.tile_size, stride=192, transform=train_tfms)
    val_ds = TiledSvamitvaDataset(val_pairs, tile_size=args.tile_size, stride=args.tile_size, transform=val_tfms)
    print(f"Tiles -> train: {len(train_ds)}, val: {len(val_ds)}")

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=2, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=2, pin_memory=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = smp.Unet(
        encoder_name="resnet18",
        encoder_weights="imagenet",
        in_channels=3,
        classes=NUM_CLASSES,
    ).to(device)

    ce_loss = nn.CrossEntropyLoss()
    dice_loss = smp.losses.DiceLoss(mode="multiclass", from_logits=True)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    scaler = torch.amp.GradScaler(enabled=(device.type == "cuda"))

    best_iou = -1.0
    out_path = Path(args.out).resolve()

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss = 0.0
        for imgs, masks in train_loader:
            imgs, masks = imgs.to(device), masks.to(device)
            optimizer.zero_grad(set_to_none=True)
            with torch.amp.autocast(device_type=device.type, enabled=(device.type == "cuda")):
                logits = model(imgs)
                loss = 0.5 * ce_loss(logits, masks) + 0.5 * dice_loss(logits, masks)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            train_loss += loss.item()

        scheduler.step()

        model.eval()
        val_ious = []
        with torch.inference_mode():
            for imgs, masks in val_loader:
                imgs, masks = imgs.to(device), masks.to(device)
                logits = model(imgs)
                val_ious.append(compute_batch_iou(logits, masks))
        mean_val_iou = float(np.mean(val_ious)) if val_ious else 0.0
        avg_loss = train_loss / max(1, len(train_loader))
        print(f"Epoch {epoch:02d}/{args.epochs} | train_loss={avg_loss:.4f} | val_mIoU={mean_val_iou:.4f}")

        if mean_val_iou >= best_iou:
            best_iou = mean_val_iou
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "num_classes": NUM_CLASSES,
                    "labels": CLASS_LABELS.tolist(),
                    "val_miou": best_iou,
                    "dataset": "utkarshsaxenadn/svamitva-drone-aerial-images",
                },
                out_path,
            )
            print(f"  -> Saved improved checkpoint to {out_path} (mIoU={best_iou:.4f})")


if __name__ == "__main__":
    main()
