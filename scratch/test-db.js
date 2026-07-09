const { Product, BranchProduct } = require('../src/core/models');

async function test() {
  try {
    const products = await Product.findAll({ raw: true });
    console.log('--- ALL PRODUCTS IN DB ---');
    console.log(products);

    const services = await Product.findAll({
      where: { type: 'service' },
      include: [{
        model: BranchProduct,
        as: 'branchProducts',
        required: false
      }]
    });
    console.log('--- SERVICES QUERY RESULTS ---');
    console.log(JSON.stringify(services, null, 2));

  } catch (err) {
    console.error(err);
  }
  process.exit();
}

test();
