const productService = require("../services/productService");
const { hasPaginationQuery, parsePagination } = require("../services/validators");

async function getProducts(_req, res, next) {
  try {
    const lang = _req.query.lang === "ar" ? "ar" : "en";

    const search = typeof _req.query.search === "string" ? _req.query.search : "";
    const categoryId = Number.isInteger(Number(_req.query.category_id)) ? Number(_req.query.category_id) : null;
    const minPrice = _req.query.min_price != null ? Number(_req.query.min_price) : NaN;
    const maxPrice = _req.query.max_price != null ? Number(_req.query.max_price) : NaN;

    const hasSearchOrFilters =
      (typeof search === "string" && search.trim()) ||
      (Number.isInteger(categoryId) && categoryId > 0) ||
      Number.isFinite(minPrice) ||
      Number.isFinite(maxPrice);

    const shouldPaginate = hasPaginationQuery(_req.query) || hasSearchOrFilters;

    if (!shouldPaginate) {
      const products = await productService.listAllProducts(lang);
      return res.json({ currency: "SAR", products });
    }

    const { page, limit, offset } = parsePagination(_req.query);
    const { total, rows } = await productService.listProductsPaged(lang, {
      search,
      categoryId: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null,
      minPrice: Number.isFinite(minPrice) ? minPrice : NaN,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : NaN,
      limit,
      offset,
    });

    const pages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
    const pagination = { page, limit, total, pages };

    // Backward compatible: keep `products` while adding `data` + `pagination`
    return res.json({ currency: "SAR", products: rows, data: rows, pagination });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getProducts };
