FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y libgomp poppler-utils

RUN pip install --no-cache-dir marker-pdf boto3

RUN python -c "from marker.models import create_model_dict; create_model_dict()"

COPY handler.py .

CMD ["handler.lambda_handler"]
