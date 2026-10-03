from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import argparse


PROJECT_ROOT = Path(__file__).resolve().parent


class InvitationHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        for line in (PROJECT_ROOT / '_headers').read_text().splitlines():
            if line.startswith('  ') and ':' in line:
                name, value = line.strip().split(':', 1)
                self.send_header(name, value.strip())
        super().end_headers()

    def __init__(self, *arguments, **options):
        super().__init__(*arguments, directory=str(PROJECT_ROOT), **options)

    def send_head(self):
        request_path = urlsplit(self.path).path
        requested_file = Path(self.translate_path(self.path)).resolve()
        try:
            relative_path = requested_file.relative_to(PROJECT_ROOT)
        except ValueError:
            self.send_error(403)
            return None
        allowed_path = request_path == '/' or relative_path in (Path('index.html'), Path('admin.html'))
        allowed_path = allowed_path or relative_path.parts[:1] == ('assets',)
        hidden_path = any(part.startswith('.') for part in relative_path.parts)
        if not allowed_path or hidden_path or (requested_file.is_dir() and request_path != '/'):
            self.send_error(403)
            return None
        return super().send_head()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Anteprima locale dell’invito, senza esporre credenziali.')
    parser.add_argument('--port', type=int, default=8000)
    arguments = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', arguments.port), InvitationHandler)
    print('Anteprima: http://127.0.0.1:{}'.format(arguments.port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
