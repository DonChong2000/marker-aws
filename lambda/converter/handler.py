import json
import os
import tempfile
import boto3
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from marker.output import text_from_rendered

s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET_NAME"]

# Lazy-loaded — avoids init phase timeout; Lambda caches between warm invocations
_model_dict = None


def get_models():
    global _model_dict
    if _model_dict is None:
        _model_dict = create_model_dict()
    return _model_dict


def write_status(job_id, status, error=None):
    body = {"jobId": job_id, "status": status}
    if error:
        body["error"] = error
    s3.put_object(
        Bucket=BUCKET,
        Key=f"status/{job_id}.json",
        Body=json.dumps(body),
        ContentType="application/json",
    )


def lambda_handler(event, context):
    record = event["Records"][0]["s3"]
    key = record["object"]["key"]  # uploads/<jobId>.<ext>

    job_id = key.split("/", 1)[1].rsplit(".", 1)[0]
    write_status(job_id, "processing")

    with tempfile.TemporaryDirectory() as tmp:
        input_path = os.path.join(tmp, os.path.basename(key))
        s3.download_file(BUCKET, key, input_path)

        try:
            converter = PdfConverter(artifact_dict=get_models())
            rendered = converter(input_path)
            markdown, _, _ = text_from_rendered(rendered)
        except Exception as e:
            write_status(job_id, "failed", error=str(e))
            raise

        s3.put_object(
            Bucket=BUCKET,
            Key=f"results/{job_id}.md",
            Body=markdown.encode("utf-8"),
            ContentType="text/markdown",
        )

    s3.delete_object(Bucket=BUCKET, Key=key)
    write_status(job_id, "done")
