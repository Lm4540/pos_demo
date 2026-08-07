# Tareas Pendientes - Optimización de Levantamiento / Auditoría Física de Inventario (5,000+ Productos)

## Objetivo
Optimizar la sección de **Auditoría e Inventario Físico / Levantamiento Inicial** (`src/modules/inventory`) para soportar y procesar adecuadamente la carga masiva de más de 5,000 productos simultáneamente en una sola sesión sin generar errores, congelamientos de interfaz o caídas de base de datos.

---

## Estado Actual de Limitaciones Identificadas

1. **Servidor HTTP (Solucionado)**:
   - Se aumentó el límite de `express.json` a `100mb` / `10mb` en `src/app.js` para evitar el error `HTTP 413 Payload Too Large`.

2. **Renderizado Frontend (Solucionado)**:
   - En `src/views/pages/inventory/audits-count.ejs` e `initial-load.ejs`, se implementó paginación (50 ítems por página) y filtro de búsqueda instantáneo local, reduciendo los nodos DOM a ~300.
   - En la edición de cantidad o escaneo, se realiza actualización puntual del nodo HTML (`<tr>` / inputs) sin destruir la tabla completa.

3. **Backend / Base de Datos (Solucionado)**:
   - En `handleFinalizeAudit` y `submitInitialLoad` (`src/modules/inventory/inventory-controller.js`), se reemplazaron los bucles N+1 secuenciales por consultas bulk (`findAll` por lotes, `BranchProduct.bulkCreate` con `updateOnDuplicate`, `ProductBatch.bulkCreate` y `Kardex.bulkCreate`), ejecutando las operaciones en solo ~3 a 5 consultas masivas por transacción.

4. **Carga de Reporte de Auditoría (Solucionado)**:
   - `renderAuditReport` en `inventory-controller.js` realiza una única consulta masiva `BranchProduct.findAll` con `Op.in` para valuar todos los ítems en memoria sin bucles N+1.

---

## Plan de Acción y Tareas Completadas

### 1. Frontend & Renderizado de Alto Rendimiento
- [x] **Paginación o Scroll Virtualizado**:
  - Implementada paginación (50-500 productos por página) con controles de navegación y filtro rápido en `audits-count.ejs` e `initial-load.ejs`.
- [x] **Actualización puntual del DOM**:
  - En lugar de invocar `renderRows()` y reescribir toda la tabla en cada cambio de cantidad o escaneo, se actualiza únicamente la fila HTML afectada (`<tr>`) o el nodo correspondiente.

### 2. Backend & Optimización SQL (Operaciones Masivas / Bulk)
- [x] **Carga de datos por lotes (Bulk Operations)**:
  - Reemplazadas las consultas individuales `BranchProduct.findOne` por una sola consulta masiva `BranchProduct.findAll({ where: { branchId, productId: { [Op.in]: productIds } } })`.
  - Reemplazadas las llamadas unitarias `bp.save()` y `ProductBatch.create()` por operaciones en lote (`bulkCreate` con `updateOnDuplicate`).
- [x] **Procesamiento de Kardex optimizado**:
  - Agrupados los registros de Kardex y creados con `Kardex.bulkCreate` en lugar de llamadas unitarias iterativas.

### 3. Procesamiento de Auditorías de Gran Volumen
- [x] **Optimización de Transacciones para Auditorías de Gran Volumen**:
  - Procesamiento ultra-eficiente en un número mínimo de operaciones en lote dentro de la transacción, evitando timeouts y bloqueos de tabla.

### 4. Optimización de Reportes
- [x] **Consulta optimizada en Reporte**:
  - En `renderAuditReport`, se utiliza `BranchProduct.findAll` con `Op.in` para pre-cargar todos los costos promedio en una sola consulta relacional en lugar del bucle N+1.

