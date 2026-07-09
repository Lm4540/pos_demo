class ESCPOSBuilder {
      constructor() {
            this.buffer = [];
            this.currentFont = 'A'; 
            this.lineLength = 40;  
      }

      /**
       * Selecciona la fuente de la impresora (Font A o Font B).
       * @param {string} font - 'A' para Font A (48 caracteres), 'B' para Font B (64 caracteres).
       */
      setFont(font = 'A') {
            let cmd;
            if (font.toUpperCase() === 'B') {
                  cmd = 0x01; // Comando para Font B
                  this.currentFont = 'B';
                  this.lineLength = 52;
            } else {
                  cmd = 0x00; // Comando para Font A
                  this.currentFont = 'A';
                  this.lineLength = 40;
            }
            this.buffer.push(0x1B, 0x4D, cmd);
            return this;
      }

      initialize() { 
            this.buffer.push(0x1B, 0x40); 
            this.buffer.push(0x1B, 0x74, 2); // Establecer codificación de caracteres a UTF-8
            return this;
      }

      align(position) {
            let cmd = 0x00; // Left
            if (position === 'center') { cmd = 0x01; } else if (position === 'right') { cmd = 0x02; }
            this.buffer.push(0x1B, 0x61, cmd); return this;
      }

      text(data) {
            const encoder = new TextEncoder();
            const encodedData = encoder.encode(data);
            this.buffer.push(...Array.from(encodedData)); return this;
      }

      newLine() { this.buffer.push(0x0A); return this; }

      newLineN(n) { for (let i = 0; i < n; i++) { this.buffer.push(0x0A); } return this; }

      bold(enable) { this.buffer.push(0x1B, 0x45, enable ? 0x01 : 0x00); return this; }

      doubleHeightWidth(enable) {
            if (enable) { this.buffer.push(0x1B, 0x21, 0x18); } else { this.buffer.push(0x1B, 0x21, 0x00); }
            return this;
      }

      cut(partial = false) {
            if (partial) { this.buffer.push(0x1D, 0x56, 0x01); } else { this.buffer.push(0x1D, 0x56, 0x00); }
            return this;
      }

      cashDrawer(pin = 2) {
            this.buffer.push(0x1B, 0x70, pin === 5 ? 0x01 : 0x00, 0x19, 0xFA);
            return this;
      }

      /**
       * Selecciona el modelo de código QR.
       * @param {number} model - 1 para Modelo 1, 2 para Modelo 2. (Modelo 2 es el más común)
       */
      qr_selectModel(model = 2) {
            // forzar la impresion de la linea actual
            this.buffer.push(0x0A);
            this.buffer.push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, (model === 1 ? 0x31 : 0x32), 0x00);
            return this;
      }

      /**
       * Establece el tamaño del módulo (dot size) del código QR.
       * @param {number} size - Tamaño en puntos (1 a 16). 3-8 es común.
       */
      qr_setModuleSize(size = 8) {
            this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size);
            return this;
      }

      /**
       * Establece el nivel de corrección de errores del código QR.
       * @param {string} level - 'L' (7%), 'M' (15%), 'Q' (25%), 'H' (30%). 'M' es el predeterminado.
       */
      qr_setErrorCorrectionLevel(level = 'M') {
            let n1;
            switch (level.toUpperCase()) {
                  case 'L': n1 = 0x30; break; // 7%
                  case 'M': n1 = 0x31; break; // 15% (default)
                  case 'Q': n1 = 0x32; break; // 25%
                  case 'H': n1 = 0x33; break; // 30%
                  default: n1 = 0x31; // Default a M
            }
            this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, n1);
            return this;
      }

      /**
       * Almacena los datos para el código QR.
       * @param {string} data - La cadena de texto a codificar en el QR.
       */
      qr_storeData(data) {
            const encoder = new TextEncoder();
            const encodedData = encoder.encode(data);
            const dataLength = encodedData.length + 3;

            this.buffer.push(
                  0x1D, 0x28, 0x6B, // GS ( k (Encabezado fijo del comando)
                  dataLength & 0xFF, (dataLength >> 8) & 0xFF,             // <L><H> (Longitud del payload, es decir, todo lo que sigue)
                  0x31,             // cn (Función 1 de códigos QR)
                  0x50,
                  0x30,             // fn (Función para almacenar datos 'P')
                  ...Array.from(encodedData) // Los bytes de tus datos del código QR
            );
            return this;
      }

      qr_print() {
            this.buffer.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
            return this;
      }

      qr(data, moduleSize = 8, errorCorrectionLevel = 'L') {
            return this.qr_selectModel(2)
                  .qr_setModuleSize(moduleSize)
                  .qr_setErrorCorrectionLevel(errorCorrectionLevel)
                  .qr_storeData(data)
                  .qr_print();
      }

      itemLine(name, qty, price, itemTotal, model_ = 'double') {
            const nameLength = Math.floor(this.lineLength * 0.35); // 35% del largo total
            const qtyLength = Math.floor(this.lineLength * 0.15); // 15%
            const priceLength = Math.floor(this.lineLength * 0.25); // 25%
            const totalLength = this.lineLength - nameLength - qtyLength - priceLength; // El resto

            const formattedName = name.padEnd(nameLength).substring(0, nameLength);
            const formattedQty = String(qty).padStart(qtyLength).substring(0, qtyLength);
            const formattedPrice = typeof price === 'number' ? price.toFixed(2) : String(price);
            const formattedTotal = typeof itemTotal === 'number' ? itemTotal.toFixed(2) : String(itemTotal);

            const padPrice = formattedPrice.padStart(priceLength).substring(0, priceLength);
            const padTotal = formattedTotal.padStart(totalLength).substring(0, totalLength);

            this.text(`${formattedName}${formattedQty}${padPrice}${padTotal}`);
            return this;
      }

      barcode_setHeight(height = 50) {
            this.buffer.push(0x1D, 0x68, height);
            return this;
      }

      barcode_setModuleWidth(width = 2) {
            this.buffer.push(0x1D, 0x77, width);
            return this;
      }

      barcode_setTextPosition(position = 'below') {
            let cmd;
            switch (position) {
                  case 'above': cmd = 0x01; break;
                  case 'below': cmd = 0x02; break;
                  case 'both': cmd = 0x03; break;
                  case 'none':
                  default: cmd = 0x00; break;
            }
            this.buffer.push(0x1D, 0x48, cmd);
            return this;
      }

      barcode_setTextFont(font = 'A') {
            this.buffer.push(0x1D, 0x66, font.toUpperCase() === 'B' ? 0x01 : 0x00);
            return this;
      }

      barcode(data, type = 'EAN13') {
            const encoder = new TextEncoder();
            const encodedData = encoder.encode(data);
            let typeCmd;

            switch (type.toUpperCase()) {
                  case 'UPC-A': typeCmd = 0x00; break;
                  case 'UPC-E': typeCmd = 0x01; break;
                  case 'EAN13': typeCmd = 0x02; break; 
                  case 'EAN8': typeCmd = 0x03; break;
                  case 'CODE39': typeCmd = 0x04; break;
                  case 'ITF': typeCmd = 0x05; break;
                  case 'CODABAR': typeCmd = 0x06; break;
                  case 'CODE93': typeCmd = 0x48; break; 
                  case 'CODE128': typeCmd = 0x49; break; 
                  default: typeCmd = 0x02;
                        console.warn(`Tipo de código de barras '${type}' no reconocido, usando EAN13 por defecto.`);
                        break;
            }

            if (typeCmd >= 0x48) { 
                  this.buffer.push(0x1D, 0x6B, typeCmd, encodedData.length, ...Array.from(encodedData));
            } else { 
                  this.buffer.push(0x1D, 0x6B, typeCmd, ...Array.from(encodedData), 0x00);
            }
            return this;
      }

      image(imageData, threshold = 128) {
            const { width, height, data } = imageData;
            const bytesPerRow = Math.ceil(width / 8);
            const paddedWidth = bytesPerRow * 8;
            const bitmap = new Uint8Array(bytesPerRow * height);
            let byteIndex = 0;

            for (let y = 0; y < height; y++) {
                  for (let x = 0; x < paddedWidth; x += 8) {
                        let currentByte = 0;
                        for (let bit = 0; bit < 8; bit++) {
                              const pixelX = x + bit;
                              if (pixelX < width) {
                                    const i = (y * width + pixelX) * 4; 
                                    const r = data[i];
                                    const g = data[i + 1];
                                    const b = data[i + 2];
                                    const avg = (r + g + b) / 3; 

                                    if (avg < threshold) {
                                          currentByte |= (0x80 >> bit); 
                                    }
                              }
                        }
                        bitmap[byteIndex++] = currentByte;
                  }
            }
            const xL = bytesPerRow & 0xFF;
            const xH = (bytesPerRow >> 8) & 0xFF;
            const yL = height & 0xFF;
            const yH = (height >> 8) & 0xFF;
            this.buffer.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...Array.from(bitmap));
            return this;
      }

      build() { return new Uint8Array(this.buffer); }
}

class WebPOSPrinterLocalServer {
      constructor(serverUrl = 'wss://localhost:4567') {
            this.serverUrl = serverUrl;
            this.ws = null;
            this.manuallyClosed = false;
      }

      setServerUrl(url) {
            this.serverUrl = url;
      }

      async connect() {
            return new Promise((resolve) => {
                  try {
                        console.log(`Intentando conectar a ${this.serverUrl}...`);
                        this.ws = new WebSocket(this.serverUrl);
                        
                        this.ws.onopen = () => {
                              console.log('Conectado al servidor de impresión local (WebSocket)');
                              resolve(true);
                        };
                        
                        this.ws.onerror = (err) => {
                              console.error('Error de conexión WebSocket:', err);
                              if (this.serverUrl.startsWith('wss://') && !this.manuallyClosed) {
                                    const fallbackUrl = this.serverUrl.replace('wss://', 'ws://');
                                    console.log(`Intentando conectar a fallback: ${fallbackUrl}`);
                                    this.serverUrl = fallbackUrl;
                                    this.connect().then(resolve);
                              } else {
                                    resolve(false);
                              }
                        };
                        
                        this.ws.onclose = () => {
                              console.log('Conexión con servidor de impresión cerrada');
                        };
                  } catch (error) {
                        console.error('Error al instanciar WebSocket:', error);
                        resolve(false);
                  }
            });
      }

      async disconnect() {
            this.manuallyClosed = true;
            if (this.ws) {
                  this.ws.close();
            }
            return true;
      }

      /**
       * Envía comandos ESC/POS a la impresora a través del servidor WebSocket.
       * @param {Uint8Array} commands - Los comandos ESC/POS en formato Uint8Array.
       * @returns {Promise<string>}
       */
      async sendCommands(commands) {
            return new Promise((resolve, reject) => {
                  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                        return reject(new Error('El servidor de impresión no está conectado.'));
                  }

                  const handleMessage = (event) => {
                        this.ws.removeEventListener('message', handleMessage);
                        try {
                              const res = JSON.parse(event.data);
                              if (res.status === 'success') {
                                    resolve(res.jobId);
                              } else {
                                    reject(new Error(res.message || 'Error desconocido del servidor de impresión'));
                              }
                        } catch (e) {
                              resolve(event.data);
                        }
                  };

                  this.ws.addEventListener('message', handleMessage);

                  // Convertir Uint8Array a una cadena Base64
                  let binary = '';
                  const len = commands.byteLength;
                  for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(commands[i]);
                  }
                  const base64Commands = btoa(binary);

                  this.ws.send(base64Commands);
            });
      }

      /**
       * Imprime un ticket de ejemplo usando los comandos ESC/POS.
       */
      async printExampleTicket({ storeName, ticketNumber, items, total }) {
            const builder = new ESCPOSBuilder();
            builder.initialize()
                   .cashDrawer()
                   .setFont('A')
                   .align('center')
                   .bold(true)
                   .text(storeName || 'MI TIENDA EJEMPLO')
                   .newLine()
                   .bold(false)
                   .text('TICKET DE PRUEBA')
                   .newLine()
                   .text(`No: ${ticketNumber || '000001'}`)
                   .newLine()
                   .text('----------------------------------------')
                   .newLine()
                   .align('left');

            builder.itemLine('Articulo', 'Cant', 'Precio', 'Subtotal');
            builder.newLine();

            if (items && items.length > 0) {
                  items.forEach(i => {
                        builder.itemLine(i.name, i.qty, i.price, i.qty * i.price);
                        builder.newLine();
                  });
            } else {
                  builder.itemLine('Producto Prueba 1', 1, 10.00, 10.00);
                  builder.newLine();
                  builder.itemLine('Producto Prueba 2', 2, 5.00, 10.00);
                  builder.newLine();
            }

            builder.text('----------------------------------------')
                   .newLine()
                   .align('right')
                   .bold(true)
                   .text(`TOTAL: $${(total || 20.00).toFixed(2)}`)
                   .bold(false)
                   .newLine()
                   .align('center')
                   .newLine()
                   .text('¡Gracias por su compra!')
                   .newLine()
                   .qr(ticketNumber || '000001', 6, 'L')
                   .newLineN(4)
                   .cut();

            return this.sendCommands(builder.build());
      }
}

// Exportar las clases para que puedan ser usadas en otros archivos JS
window.ESCPOSBuilder = ESCPOSBuilder;
window.WebPOSPrinterLocalServer = WebPOSPrinterLocalServer;
