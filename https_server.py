import http.server
import ssl
import socketserver
import os

PORT = 8443  # Changed from 5443
DIRECTORY = os.path.expanduser("~/projects/food-supply-voice-ai/frontend/dist")

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(
    os.path.expanduser('~/projects/food-supply-voice-ai/cert.pem'),
    os.path.expanduser('~/projects/food-supply-voice-ai/key.pem')
)

with socketserver.TCPServer(("0.0.0.0", PORT), MyHTTPRequestHandler) as httpd:
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    print(f"Serving HTTPS on port {PORT}")
    httpd.serve_forever()