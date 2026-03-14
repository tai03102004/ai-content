from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/drive']

creds = service_account.Credentials.from_service_account_file(
    '../service_account.json',
    scopes=SCOPES
)

service = build('drive', 'v3', credentials=creds)

results = service.files().list().execute()
print(results)