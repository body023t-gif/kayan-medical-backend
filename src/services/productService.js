const { all, get } = require("../config/database");

function resolveLang(lang) {
  return lang === "ar" ? "ar" : "en";
}

function mapProductRow(row, lang) {
  const suffix = resolveLang(lang);
  return {
    id: row.id,
    name: row[`name_${suffix}`],
    description: row[`description_${suffix}`],
    name_ar: row.name_ar,
    name_en: row.name_en,
    description_ar: row.description_ar,
    description_en: row.description_en,
    price: Number(Number(row.price).toFixed(2)),
    image_url: row.image_url || row.image,
    category_id: row.category_id,
  };
}

function buildProductsWhere({ search, categoryId, minPrice, maxPrice }) {
  const clauses = ["1=1"];
  const params = [];

  if (Number.isInteger(categoryId) && categoryId > 0) {
    clauses.push("category_id = ?");
    params.push(categoryId);
  }

  if (Number.isFinite(minPrice)) {
    clauses.push("price >= ?");
    params.push(minPrice);
  }

  if (Number.isFinite(maxPrice)) {
    clauses.push("price <= ?");
    params.push(maxPrice);
  }

  const normalizedSearch = typeof search === "string" ? search.trim() : "";
  if (normalizedSearch) {
    const like = `%${normalizedSearch}%`;
    clauses.push("(name_ar LIKE ? OR name_en LIKE ? OR description_ar LIKE ? OR description_en LIKE ?)");
    params.push(like, like, like, like);
  }

  return { whereSql: `WHERE ${clauses.join(" AND ")}`, params };
}

async function listAllProducts(lang) {
  const rows = await all(
    "SELECT id, name_ar, name_en, description_ar, description_en, price, image, image_url, category_id FROM products ORDER BY id ASC"
  );
  return rows.map((row) => mapProductRow(row, lang));
}

async function listProductsPaged(lang, { search, categoryId, minPrice, maxPrice, limit, offset }) {
  const { whereSql, params } = buildProductsWhere({ search, categoryId, minPrice, maxPrice });

  const countRow = await get(`SELECT COUNT(*) AS total FROM products ${whereSql}`, params);
  const total = Number(countRow?.total || 0);

  const rows = await all(
    `
      SELECT id, name_ar, name_en, description_ar, description_en, price, image, image_url, category_id
      FROM products
      ${whereSql}
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  return { total, rows: rows.map((row) => mapProductRow(row, lang)) };
}

module.exports = {
  listAllProducts,
  listProductsPaged,
};

