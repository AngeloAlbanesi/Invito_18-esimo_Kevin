from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
import importlib.util
import threading


specification = importlib.util.spec_from_file_location('invitation_server', Path(__file__).resolve().parents[1] / 'serve.py')
invitation_server = importlib.util.module_from_spec(specification)
specification.loader.exec_module(invitation_server)
server = ThreadingHTTPServer(('127.0.0.1', 0), invitation_server.InvitationHandler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()

try:
    for request_path, expected_status in [
        ('/', 200),
        ('/admin.html', 200),
        ('/deployment.json', 403),
        ('/output/private/activation.txt', 403),
        ('/index.html', 200),
        ('/assets/images/favicon.svg', 200),
        ('/assets/images/og-invito-v1.jpg', 200),
        ('/.env', 403),
        ('/README.md', 403),
        ('/supabase/functions/rsvp/index.js', 403),
        ('/assets/../README.md', 403),
        ('/assets/%2e%2e/%2eenv', 403),
        ('/assets/', 403),
    ]:
        connection = HTTPConnection('127.0.0.1', server.server_port, timeout=5)
        connection.request('GET', request_path)
        response = connection.getresponse()
        assert response.status == expected_status, (request_path, response.status)
        assert response.getheader('X-Frame-Options') == 'DENY'
        assert response.getheader('X-Content-Type-Options') == 'nosniff'
        assert response.getheader('Referrer-Policy') == 'no-referrer'
        assert "unsafe-inline" not in response.getheader('Content-Security-Policy')
        response.read()
        connection.close()
    print('Anteprima: asset disponibili, credenziali e percorsi privati bloccati.')
finally:
    server.shutdown()
    server.server_close()
    thread.join()
