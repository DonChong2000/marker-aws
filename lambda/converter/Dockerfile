FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y libgomp poppler-utils

RUN pip install --no-cache-dir marker-pdf boto3

# marker (via fasthtml/monsterui) tries to create site-packages/static at runtime,
# which is read-only on Lambda. Redirect it to /tmp via symlink.
RUN rm -rf /var/lang/lib/python3.12/site-packages/static && \
    ln -s /tmp/marker-static /var/lang/lib/python3.12/site-packages/static

# Use a fixed path (not HOME-relative) so models are readable at Lambda runtime
ENV SURYA_MODEL_DIR=/opt/ml/models
ENV HF_HOME=/opt/ml/hf
ENV TORCH_HOME=/opt/ml/torch

# Pre-download models into the fixed path (baked into image layer)
RUN mkdir -p /opt/ml/models /opt/ml/hf /opt/ml/torch && \
    python -c "from marker.models import create_model_dict; create_model_dict()"

COPY handler.py .

CMD ["handler.lambda_handler"]
