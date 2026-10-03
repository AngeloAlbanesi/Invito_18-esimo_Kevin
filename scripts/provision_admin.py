import argparse
import json
import subprocess
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROJECT_REF = 'dnpvzzrfdwbcecexuccm'


def provision_admin(email, cli):
    configuration = json.loads((PROJECT_ROOT / 'deployment.json').read_text())
    site_url = configuration['siteUrl']
    if not site_url or not site_url.startswith('https://'):
        raise ValueError('Configura prima il sito di produzione.')
    result = subprocess.run(
        [cli, 'projects', 'api-keys', '--project-ref', PROJECT_REF, '--output', 'json'],
        capture_output=True, text=True, check=True,
    )
    credentials = json.loads(result.stdout)
    service_key = next(key['api_key'] for key in credentials if key['name'] == 'service_role')
    headers = {'apikey': service_key, 'Authorization': 'Bearer ' + service_key,
               'Content-Type': 'application/json'}
    endpoint = 'https://' + PROJECT_REF + '.supabase.co/auth/v1/admin/generate_link'
    verification_type = 'invite'
    for attempt in range(2):
        request = Request(endpoint, headers=headers, method='POST',
                          data=json.dumps({'type': verification_type, 'email': email}).encode())
        try:
            with urlopen(request, timeout=20) as response:
                invitation = json.load(response)
            break
        except HTTPError as error:
            failure = json.loads(error.read())
            if attempt == 0 and failure.get('error_code') == 'email_exists':
                verification_type = 'recovery'
                continue
            raise ValueError('Attivazione non riuscita: HTTP ' + str(error.code)) from None
    private_root = PROJECT_ROOT / 'output' / 'private'
    private_root.mkdir(parents=True, exist_ok=True)
    private_root.chmod(0o700)
    fragment = urlencode({'token_hash': invitation['hashed_token'], 'type': verification_type})
    activation_path = private_root / 'attivazione-kevin.txt'
    activation_path.write_text(site_url.rstrip('/') + '/admin.html#' + fragment + '\n')
    activation_path.chmod(0o600)
    backend_path = private_root / 'backend.env'
    existing_lines = backend_path.read_text().splitlines() if backend_path.exists() else []
    existing_lines = [line for line in existing_lines if not line.startswith('RSVP_ADMIN_USER_ID=')]
    user_id = invitation.get('id') or invitation.get('user', {}).get('id')
    if not user_id:
        raise ValueError('Identificativo account assente: configurazione non modificata.')
    backend_path.write_text('\n'.join(existing_lines + ['RSVP_ADMIN_USER_ID=' + user_id]) + '\n')
    backend_path.chmod(0o600)
    print('Account organizzatore configurato. Nessuna email inviata.')
    print('Link di attivazione privato salvato in: ' + str(activation_path))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Prepara un link privato di attivazione, senza inviare email.')
    parser.add_argument('--email', required=True)
    parser.add_argument('--supabase-cli', default='supabase')
    arguments = parser.parse_args()
    try:
        provision_admin(arguments.email, arguments.supabase_cli)
    except (ValueError, OSError, subprocess.CalledProcessError, KeyError, StopIteration):
        parser.exit(1, 'Attivazione non completata. Verifica accesso CLI e configurazione; nessuna credenziale nei log.\n')
