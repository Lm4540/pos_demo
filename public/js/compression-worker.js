// Web Worker para compresión de imágenes en el cliente
self.onmessage = async (event) => {
  const { file, maxPx = 800, quality = 0.8 } = event.data;
  
  try {
    // 1. Crear ImageBitmap desde el archivo Blob
    const bitmap = await createImageBitmap(file);
    
    // 2. Calcular dimensiones reducidas manteniendo relación de aspecto
    let width = bitmap.width;
    let height = bitmap.height;
    
    if (width > maxPx || height > maxPx) {
      if (width > height) {
        height = Math.round((height * maxPx) / width);
        width = maxPx;
      } else {
        width = Math.round((width * maxPx) / height);
        height = maxPx;
      }
    }
    
    // 3. Renderizar en OffscreenCanvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    // 4. Exportar como JPEG comprimido
    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: quality
    });
    
    // 5. Devolver resultado al hilo principal
    self.postMessage({ success: true, blob, filename: file.name.replace(/\.[^/.]+$/, "") + '.jpg' });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};
