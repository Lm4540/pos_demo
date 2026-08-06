# Tareas Pendientes - Optimización de Levantamiento / Auditoría Física de Inventario (5,000+ Productos)

## Objetivo
Optimizar la sección de **Auditoría e Inventario Físico / Levantamiento Inicial** (`src/modules/inventory`) para soportar y procesar adecuadamente la carga masiva de más de 5,000 productos simultáneamente en una sola sesión sin generar errores, congelamientos de interfaz o caídas de base de datos.

---

## Estado Actual de Limitaciones Identificadas

1. **Servidor HTTP (Solucionado parcialmente)**:
   - Se aumentó el límite de `express.json` a `100mb` / `10mb` en `src/app.js` para evitar el error `HTTP 413 Payload Too Large`.

2. **Renderizado Frontend (Congelamiento del Navegador / DOM Overhead)**:
   - En `src/views/pages/inventory/audits-count.ejs`, al cargar la plantilla masiva se renderizan **más de 30,000 nodos DOM** simultáneamente.
   - En cada edición de cantidad o escaneo de código de barras, se ejecuta `renderRows()`, lo que destruye y vuelve a construir toda la tabla DOM, causando congelamiento de la pestaña.

3. **Backend / Base de Datos (Consultas N+1 en Secuencia y Timeout de Transacción)**:
   - En `handleFinalizeAudit` y `submitInitialLoad` (`src/modules/inventory/inventory-controller.js`), los ítems se procesan individualmente con `await` dentro de un bucle `for...of`.
   - Con 5,000 ítems se generan **más de 20,000 consultas SQL secuenciales** en una sola transacción MySQL, provocando tiempos de espera de 30 a 120 segundos, rechazo por *HTTP Gateway Timeout (504)* y bloqueos en InnoDB (`InnoDB lock wait timeout`).

4. **Carga de Reporte de Auditoría**:
   - `renderAuditReport` en `inventory-controller.js` realiza 5,000 consultas individuales a `BranchProduct.findOne` antes de renderizar la vista de reporte.

---

## Plan de Acción y Tareas Futuras

### 1. Frontend & Renderizado de Alto Rendimiento
- [ ] **Paginación o Scroll Virtualizado**:
  - Implementar paginación (50-100 productos por página) o una librería de Virtual Scrolling (ej. Clusterize.js o renderizado incremental) en `audits-count.ejs` e `initial-load.ejs`.
- [ ] **Actualización puntual del DOM**:
  - En lugar de invocar `renderRows()` y reescribir toda la tabla en cada cambio de cantidad o escaneo, actualizar únicamente la fila HTML afectada (`<tr>`) o el nodo del input correspondiente.

### 2. Backend & Optimización SQL (Operaciones Masivas / Bulk)
- [ ] **Carga de datos por lotes (Bulk Operations)**:
  - Reemplazar las consultas individuales `BranchProduct.findOne` dentro del bucle por una sola consulta masiva `BranchProduct.findAll({ where: { branchId, productId: itemsIds } })`.
  - Reemplazar las llamadas unitarias de `bp.save()` o `ProductBatch.create()` por operaciones en lote (`bulkCreate` / `upsert`).
- [ ] **Procesamiento de Kardex optimizado**:
  - Agrupar los registros de Kardex y crearlos con un `Kardex.bulkCreate` en lugar de una función iterativa individual.

### 3. Procesamiento Asíncrono / Trabajo en Segundo Plano (Background Jobs)
- [ ] **Finalización Asíncrona para Auditorías de Gran Volumen**:
  - Para auditorías con más de 1,000 productos, enviar la solicitud de finalización a una cola en segundo plano o responder de inmediato al usuario indicando que el ajuste se está procesando, notificando al completar.

### 4. Optimización de Reportes
- [ ] **Consulta optimizada con `include` en Reporte**:
  - En `renderAuditReport`, utilizar Sequelize `include` con `BranchProduct` para traer los costos promedio en una sola consulta relacional en lugar del bucle N+1.
