from app.storage import test_storage_connection

try:
    if test_storage_connection():
        print("SUCCESS: FileShare connected to Backblaze B2!")
except Exception as error:
    print("Backblaze connection failed.")
    print("Error type:", type(error).__name__)
    print("Check your credentials, bucket name, and endpoint.")