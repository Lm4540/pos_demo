ALTER TABLE purchase_orders MODIFY supplierId INT NULL;
ALTER TABLE purchase_orders MODIFY orderNumber VARCHAR(50) NULL;
ALTER TABLE purchase_orders ADD COLUMN supplierName VARCHAR(255) NULL AFTER supplierId;