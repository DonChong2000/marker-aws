import json
import os
import uuid
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET_NAME"]
UPLOAD_EXPIRES = 300   # 5 min to complete upload
DOWNLOAD_EXPIRES = 900 # 15 min to download result


def respond(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }


def presign(event):
    body = json.loads(event.get("body") or "{}")
    filename = body.get("filename", "upload")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"

    job_id = str(uuid.uuid4())
    key = f"uploads/{job_id}.{ext}"

    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key},
        ExpiresIn=UPLOAD_EXPIRES,
    )
    return respond(200, {"jobId": job_id, "uploadUrl": url, "key": key})


def status(job_id):
    key = f"status/{job_id}.json"
    try:
        obj = s3.get_object(Bucket=BUCKET, Key=key)
        data = json.loads(obj["Body"].read())
        return respond(200, data)
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return respond(200, {"jobId": job_id, "status": "pending"})
        raise


def result(job_id):
    key = f"results/{job_id}.md"
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404", "403"):
            return respond(404, {"error": "Result not ready"})
        raise

    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET, "Key": key},
        ExpiresIn=DOWNLOAD_EXPIRES,
    )
    return respond(200, {"jobId": job_id, "downloadUrl": url})


def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    path = event.get("rawPath", "")

    if method == "POST" and path == "/presign":
        return presign(event)

    if method == "GET" and path.startswith("/status/"):
        job_id = path.split("/status/", 1)[1]
        return status(job_id)

    if method == "GET" and path.startswith("/result/"):
        job_id = path.split("/result/", 1)[1]
        return result(job_id)

    if method == "OPTIONS":
        return respond(200, {})

    return respond(404, {"error": "Not found"})

