import argparse
import html
import json
import shutil
from pathlib import Path
from urllib.parse import urlsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = PROJECT_ROOT / 'output' / 'site'


def build_site(configuration):
    site_url = configuration.get('siteUrl')
    site_key = configuration.get('turnstileSiteKey')
    endpoint = configuration.get('rsvpEndpoint')
    if set(configuration) != {'siteUrl', 'turnstileSiteKey', 'supabasePublishableKey', 'rsvpEndpoint'}:
        raise ValueError('Configurazione pubblica inattesa: nessun campo aggiuntivo ammesso.')
    if not isinstance(configuration.get('supabasePublishableKey'), str) or not configuration['supabasePublishableKey'].startswith('sb_publishable_'):
        raise ValueError('Configura la chiave pubblica Supabase per l’accesso al pannello.')
    parsed_url = urlsplit(site_url or '')
    if (parsed_url.scheme != 'https' or not parsed_url.hostname
            or parsed_url.username or parsed_url.password
            or parsed_url.path not in ('', '/') or parsed_url.query or parsed_url.fragment):
        raise ValueError('Configura siteUrl con la sola origine HTTPS del sito Cloudflare.')
    if not isinstance(site_key, str) or not site_key or '000000000000000000' in site_key:
        raise ValueError('Configura una site key Turnstile di produzione, non una chiave di test.')
    if endpoint != 'https://dnpvzzrfdwbcecexuccm.supabase.co/functions/v1/rsvp':
        raise ValueError('Endpoint RSVP inatteso: verifica anche CSP e backend.')
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    OUTPUT_ROOT.mkdir(parents=True)
    source_html = (PROJECT_ROOT / 'index.html').read_text()
    source_html = source_html.replace(
        'https://angeloalbanesi.github.io/Invito_18-esimo_Kevin/', site_url.rstrip('/') + '/')
    (OUTPUT_ROOT / 'index.html').write_text(source_html)
    shutil.copyfile(PROJECT_ROOT / 'admin.html', OUTPUT_ROOT / 'admin.html')
    shutil.copyfile(PROJECT_ROOT / '404.html', OUTPUT_ROOT / '404.html')
    assets_root = PROJECT_ROOT / 'assets'
    for source_path in assets_root.rglob('*'):
        if source_path.is_symlink():
            raise ValueError('Symlink non ammessi negli asset pubblici.')
        if not source_path.is_file():
            continue
        relative_path = source_path.relative_to(assets_root)
        if any(part.startswith('.') for part in relative_path.parts):
            continue
        if source_path.suffix.lower() not in {'.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ttf', '.woff', '.woff2', '.mp3', '.txt'}:
            continue
        destination = OUTPUT_ROOT / 'assets' / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_path, destination)
    (OUTPUT_ROOT / 'assets' / 'site-config.js').write_text(
        'const PUBLIC_SITE_CONFIG = Object.freeze(' + json.dumps(configuration) + ');\n')
    shutil.copyfile(PROJECT_ROOT / '_headers', OUTPUT_ROOT / '_headers')
    redirect_html = ('<!doctype html><html lang="it"><meta charset="utf-8">'
                     '<meta name="referrer" content="no-referrer">'
                     '<title>Invito di Kevin</title><h1>L’invito ha un nuovo indirizzo</h1>'
                     '<p>Per confermare usa il link personale ricevuto da Kevin.</p>'
                     '<p><a href="' + html.escape(site_url, quote=True)
                     + '">Apri l’invito</a></p></html>')
    legacy_root = PROJECT_ROOT / 'output' / 'legacy'
    legacy_root.mkdir(parents=True, exist_ok=True)
    (legacy_root / 'index.html').write_text(redirect_html)
    return OUTPUT_ROOT


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Prepara soltanto file pubblici per Cloudflare Pages.')
    parser.add_argument('--config', type=Path, default=PROJECT_ROOT / 'deployment.json')
    options = parser.parse_args()
    try:
        result = build_site(json.loads(options.config.read_text()))
    except (ValueError, OSError) as error:
        parser.exit(1, str(error) + '\n')
    print('Pacchetto pubblico pronto: ' + str(result))
