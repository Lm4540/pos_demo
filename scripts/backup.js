const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

function rotateBackups(backupsDir, dbName) {
  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith(`backup-${dbName}-`) && f.endsWith('.sql'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupsDir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time); // newest first
      
    if (files.length > 10) {
      console.log(`[Backup Rotación] Eliminando respaldos antiguos...`);
      for (let i = 10; i < files.length; i++) {
        fs.unlinkSync(path.join(backupsDir, files[i].name));
        console.log(`[Backup Rotación] Eliminado: ${files[i].name}`);
      }
    }
  } catch (rotErr) {
    console.error(`[Backup Rotación Error]`, rotErr);
  }
}

async function runNativeBackup(outputPath, dbName, backupsDir) {
  console.log(`[Backup Fallback] Intentando copia de seguridad nativa vía Sequelize...`);
  try {
    const { sequelize } = require('../src/config/database');
    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    
    let sqlContent = `-- Simple POS Native SQL Backup\n`;
    sqlContent += `-- Generated: ${new Date().toLocaleString('es-SV')}\n\n`;
    sqlContent += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;
    
    for (const table of tables) {
      // Fetch all records
      const rows = await sequelize.query(`SELECT * FROM \`${table}\``, { type: sequelize.QueryTypes.SELECT });
      if (rows.length === 0) continue;
      
      sqlContent += `-- Data for table \`${table}\` (${rows.length} rows)\n`;
      const columns = Object.keys(rows[0]);
      
      for (const row of rows) {
        const values = columns.map(col => {
          const val = row[col];
          if (val === null) return 'NULL';
          if (typeof val === 'number') return val;
          if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
          if (typeof val === 'boolean') return val ? 1 : 0;
          if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`;
          const escaped = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          return `'${escaped}'`;
        });
        
        sqlContent += `INSERT INTO \`${table}\` (\`${columns.join('`, `')}\`) VALUES (${values.join(', ')}) ON DUPLICATE KEY UPDATE ${columns.map(c => `\`${c}\`=VALUES(\`${c}\`)`).join(', ')};\n`;
      }
      sqlContent += `\n`;
    }
    
    sqlContent += `SET FOREIGN_KEY_CHECKS = 1;\n`;
    fs.writeFileSync(outputPath, sqlContent, 'utf8');
    console.log(`[Backup Éxito] Base de datos respaldada correctamente vía Sequelize.`);
    console.log(`[Backup Archivo]: ${outputPath}`);
    
    rotateBackups(backupsDir, dbName);
  } catch (err) {
    console.error(`[Backup Fallback Error] Falló la copia de seguridad nativa:`, err.message);
  }
}

function runBackup() {
  const backupsDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD === '' ? null : (process.env.DB_PASSWORD || null);
  const dbName = process.env.DB_NAME || 'punto_venta';
  const dbHost = process.env.DB_HOST || '127.0.0.1';
  const dbPort = process.env.DB_PORT || '3306';

  const timestamp = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
  const backupFile = `backup-${dbName}-${timestamp}.sql`;
  const outputPath = path.join(backupsDir, backupFile);

  console.log(`[Backup] [${new Date().toLocaleString('es-SV')}] Iniciando copia de seguridad para base de datos: "${dbName}"...`);

  // First try: mysql command line utility (mysqldump)
  let cmd = `mysqldump -h ${dbHost} -P ${dbPort} -u ${dbUser}`;
  if (dbPass) {
    cmd += ` --password="${dbPass}"`;
  }
  cmd += ` ${dbName} > "${outputPath}"`;

  exec(cmd, async (error, stdout, stderr) => {
    if (error) {
      console.warn(`[Backup Advertencia] mysqldump no disponible o falló:`, error.message);
      // Fallback to native sequelize-based exporter
      await runNativeBackup(outputPath, dbName, backupsDir);
      return;
    }
    
    console.log(`[Backup Éxito] Base de datos respaldada correctamente (vía mysqldump).`);
    console.log(`[Backup Archivo]: ${outputPath}`);
    rotateBackups(backupsDir, dbName);
  });
}

// Check command line arguments
if (process.argv.includes('--schedule') || process.argv.includes('--daemon')) {
  console.log('[Scheduler] Iniciando daemon de copias de seguridad...');
  
  function scheduleNext() {
    const now = new Date();
    const nextBackup = new Date();
    // Schedule for 11:59 PM today
    nextBackup.setHours(23, 59, 0, 0);

    if (now > nextBackup) {
      nextBackup.setDate(nextBackup.getDate() + 1);
    }

    const msUntilBackup = nextBackup.getTime() - now.getTime();
    console.log(`[Scheduler] Próximo respaldo diario programado para: ${nextBackup.toLocaleString('es-SV')}`);
    
    setTimeout(() => {
      runBackup();
      // Schedule the next one tomorrow
      scheduleNext();
    }, msUntilBackup);
  }
  
  scheduleNext();
} else {
  // Direct execution
  runBackup();
}

module.exports = runBackup;
