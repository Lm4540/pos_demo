const { Branch, User } = require('../models');

const seedInitialData = async () => {
  try {
    // 1. Check if we need to create the default branch
    let defaultBranch = await Branch.findOne();
    if (!defaultBranch) {
      defaultBranch = await Branch.create({
        name: 'Casa Central',
        address: 'San Salvador, El Salvador',
        phone: '2222-2222'
      });
      console.log('Se ha creado la sucursal por defecto: Casa Central.');
    }

    // 2. Check if we need to create the default admin user
    const adminCount = await User.count({ where: { roleId: 'admin' } });
    if (adminCount === 0) {
      const defaultAdmin = await User.create({
        branchId: defaultBranch.id,
        roleId: 'admin',
        username: 'admin',
        passwordHash: 'admin123', // Automatically hashed by the model beforeSave hook
        fullName: 'Administrador Central',
        status: 'active'
      });
      console.log(`Se ha creado el usuario administrador por defecto: username: "admin", password: "admin123" (branchId: ${defaultBranch.id})`);
    }
  } catch (error) {
    console.error('Error al sembrar datos iniciales:', error);
  }
};

module.exports = {
  seedInitialData
};
