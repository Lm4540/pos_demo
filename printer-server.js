const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const WebSocket = require('ws');
const { exec } = require('child_process');

const PORT = 4567;
// AHORA ESTE ARGUMENTO DEBE SER EL NOMBRE COMPARTIDO DE LA IMPRESORA
const PRINTER_SHARE_NAME = "LR2000";

if (!PRINTER_SHARE_NAME) {
    console.error("ERROR: El nombre COMPARTIDO de la impresora es requerido.");
    console.error("Uso: node printer-server.js \"NOMBRE_COMPARTIDO\"");
    process.exit(1);
}

// Ruta dinámica al certificado .pfx (Manteniendo tu configuración HTTPS)
const pfxPath = path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop', 'localhost.pfx');

let server;
let isHttps = false;
const requestHandler = (req, res) => {
    // Configurar cabeceras CORS por si consultas desde el navegador
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            message: 'Servidor de impresión local activo',
            printer: PRINTER_SHARE_NAME,
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
};

try {
    if (fs.existsSync(pfxPath)) {
        server = https.createServer({
            pfx: fs.readFileSync(pfxPath),
            passphrase: '123456'
        }, requestHandler);
        isHttps = true;
    } else {
        console.warn(`WARNING: Certificado PFX no encontrado en ${pfxPath}. Iniciando servidor en modo HTTP/WS (sin cifrado).`);
        server = http.createServer(requestHandler);
    }
} catch (e) {
    console.warn(`WARNING: Error al cargar certificado PFX (${e.message}). Iniciando servidor en modo HTTP/WS (sin cifrado).`);
    server = http.createServer();
}

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Cliente POS conectado.');

    ws.on('message', (message) => {
        try {
            const base64Data = message.toString().trim();
            const escposCommands = Buffer.from(base64Data, 'base64');

            // 1. Crear un archivo binario temporal
            const tempFilePath = path.join(__dirname, `ticket_${Date.now()}_${Math.floor(Math.random() * 1000)}.bin`);
            fs.writeFileSync(tempFilePath, escposCommands);

            // 2. Comando nativo de Windows para enviar el binario RAW a la impresora
            const command = `copy /B "${tempFilePath}" "\\\\localhost\\${PRINTER_SHARE_NAME}"`;

            exec(command, (error, stdout, stderr) => {
                // 3. Limpiar el archivo temporal
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }

                if (error) {
                    console.error(`Error de impresión al copiar a la impresora: ${error.message}`);
                    ws.send(JSON.stringify({ status: 'error', message: `Error enviando a la cola de Windows: ${error.message}` }));
                    return;
                }

                console.log(`Impresión enviada correctamente a la impresora: ${PRINTER_SHARE_NAME}`);
                ws.send(JSON.stringify({ status: 'success', jobId: Date.now() }));
            });

        } catch (error) {
            console.error("Error procesando los comandos de impresión:", error);
            ws.send(JSON.stringify({ status: 'error', message: 'Error interno decodificando comandos.' }));
        }
    });

    ws.on('close', () => {
        console.log('Cliente POS desconectado.');
    });
});

server.listen(PORT, () => {
    const protocol = isHttps ? 'wss' : 'ws';
    console.log(`Servidor de impresión iniciado en ${protocol}://localhost:${PORT}`);
    console.log(`Enviando tickets a la impresora compartida: \\\\localhost\\${PRINTER_SHARE_NAME}`);
});
