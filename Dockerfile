FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    PORT=8080

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch to avoid pulling CUDA libraries into the image.
RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.5.1+cpu torchvision==0.20.1+cpu

COPY public/assets/aistudio/requirements.cloudrun.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY public/assets/aistudio/app_3c61c556.py /app/app_3c61c556.py
COPY public/assets/aistudio/final_drone_model.pth /app/final_drone_model.pth

EXPOSE 8080

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 1 --timeout 900 app_3c61c556:app"]
