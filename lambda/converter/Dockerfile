FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y libgomp poppler-utils

RUN pip install --no-cache-dir marker-pdf boto3

# Use a fixed path (not HOME-relative) so models are readable at Lambda runtime
ENV SURYA_MODEL_DIR=/opt/ml/models
ENV HF_HOME=/opt/ml/hf
ENV TORCH_HOME=/opt/ml/torch

# Pre-download models into the fixed path (baked into image layer)
RUN mkdir -p /opt/ml/models /opt/ml/hf /opt/ml/torch && \
    python -c "from marker.models import create_model_dict; create_model_dict()"

# Pre-download the font marker writes lazily to site-packages/static/fonts.
# Without this, first conversion hits EROFS trying to write to read-only FS.
RUN python -c "from marker.util import download_font; download_font()"

COPY handler.py .

CMD ["handler.lambda_handler"]
