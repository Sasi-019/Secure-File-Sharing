import os

import boto3
from dotenv import load_dotenv

load_dotenv()

B2_KEY_ID = os.getenv("B2_KEY_ID")
B2_APPLICATION_KEY = os.getenv("B2_APPLICATION_KEY")
B2_BUCKET_NAME = os.getenv("B2_BUCKET_NAME")
B2_ENDPOINT_URL = os.getenv("B2_ENDPOINT_URL")

if not all([
    B2_KEY_ID,
    B2_APPLICATION_KEY,
    B2_BUCKET_NAME,
    B2_ENDPOINT_URL,
]):
    raise RuntimeError(
        "Backblaze configuration is incomplete. "
        "Check the B2 variables in backend/.env."
    )

s3_client = boto3.client(
    "s3",
    endpoint_url=B2_ENDPOINT_URL,
    aws_access_key_id=B2_KEY_ID,
    aws_secret_access_key=B2_APPLICATION_KEY,
    region_name="us-east-005",
)

def test_storage_connection():
    """Check access to the configured private bucket."""
    response = s3_client.head_bucket(Bucket=B2_BUCKET_NAME)
    return response["ResponseMetadata"]["HTTPStatusCode"] == 200