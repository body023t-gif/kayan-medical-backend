const { get, run } = require("../config/database");

const defaultCategories = [
  {
    name_ar: "أجهزة القياس",
    name_en: "Monitoring Devices",
    image_url: "https://example.com/images/categories/monitoring.jpg",
  },
  {
    name_ar: "المستلزمات الطبية",
    name_en: "Medical Supplies",
    image_url: "https://example.com/images/categories/supplies.jpg",
  },
];

const defaultProducts = [
  {
    name_ar: "جهاز قياس الضغط",
    name_en: "Blood Pressure Monitor",
    description_ar: "جهاز رقمي لقياس ضغط الدم في المنزل.",
    description_en: "Digital home blood pressure monitor.",
    price: 189.0,
    image_url: "https://example.com/images/bp-monitor.jpg",
    category_id: 1,
  },
  {
    name_ar: "جهاز قياس السكر",
    name_en: "Glucose Meter",
    description_ar: "جهاز موثوق لمتابعة مستوى السكر يوميا.",
    description_en: "Reliable glucose meter for daily tracking.",
    price: 129.0,
    image_url: "https://example.com/images/glucose-meter.jpg",
    category_id: 1,
  },
  {
    name_ar: "مقياس حرارة رقمي",
    name_en: "Digital Thermometer",
    description_ar: "مقياس حرارة سريع ودقيق للاستخدام المنزلي.",
    description_en: "Fast and accurate digital thermometer.",
    price: 45.0,
    image_url: "https://example.com/images/thermometer.jpg",
    category_id: 2,
  },
];

async function seedProducts() {
  const categoriesCount = await get("SELECT COUNT(*) AS count FROM categories");
  if (!categoriesCount || categoriesCount.count === 0) {
    for (const category of defaultCategories) {
      await run(
        `
        INSERT INTO categories (name_ar, name_en, image_url)
        VALUES (?, ?, ?)
        `,
        [category.name_ar, category.name_en, category.image_url]
      );
    }
  }

  const row = await get("SELECT COUNT(*) AS count FROM products");
  if (!row || row.count === 0) {
    for (const product of defaultProducts) {
      await run(
        `
        INSERT INTO products (name_ar, name_en, description_ar, description_en, price, image, image_url, category_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          product.name_ar,
          product.name_en,
          product.description_ar,
          product.description_en,
          product.price,
          product.image_url,
          product.image_url,
          product.category_id,
        ]
      );
    }
  }

  const couponRow = await get("SELECT COUNT(*) AS count FROM coupons");
  if (!couponRow || couponRow.count === 0) {
    await run(
      `
      INSERT INTO coupons (code, discount_percentage, expires_at, max_usage, used_count)
      VALUES ('WELCOME10', 10, datetime('now', '+60 day'), 100, 0)
      `
    );
  }
}

module.exports = { seedProducts };
