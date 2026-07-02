const { Kardex, BranchProduct } = require('../../core/models');

const logKardex = async ({ productId, branchId, userId, quantity, isInput, type, description, transaction }) => {
  // Query branch stock *before* the new change is committed
  const bp = await BranchProduct.findOne({
    where: { productId, branchId },
    transaction
  });
  const previousBranchStock = bp ? bp.totalStock : 0;

  // Query global stock *before* the new change is committed
  const previousGlobalStock = await BranchProduct.sum('totalStock', {
    where: { productId },
    transaction
  }) || 0;

  await Kardex.create({
    productId,
    branchId,
    userId,
    quantity,
    isInput,
    previousGlobalStock,
    previousBranchStock,
    type,
    description
  }, { transaction });
};

module.exports = { logKardex };
