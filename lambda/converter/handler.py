import json
import os
import tempfile
import boto3

s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET_NAME"]

# Deferred — marker/torch imports are too heavy for Lambda's 10s init window.
# Loaded once on first invocation and cached for warm calls.
_model_dict = None
_PdfConverter = None
_text_from_rendered = None


def _load():
    global _model_dict, _PdfConverter, _text_from_rendered
    if _model_dict is None:
        from marker.converters.pdf import PdfConverter
        from marker.models import create_model_dict
        from marker.output import text_from_rendered
        _PdfConverter = PdfConverter
        _text_from_rendered = text_from_rendered
        _model_dict = create_model_dict()


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

    _load()

    with tempfile.TemporaryDirectory() as tmp:
        input_path = os.path.join(tmp, os.path.basename(key))
        s3.download_file(BUCKET, key, input_path)

        try:
            converter = _PdfConverter(artifact_dict=_model_dict)
            rendered = converter(input_path)
            markdown, _, _ = _text_from_rendered(rendered)
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
