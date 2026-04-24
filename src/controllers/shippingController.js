const { run, get, all } = require("../config/database");

const upsertShippingRule = async (req, res, next) => {
  try {
    const { city, cost } = req.body;
    
    if (!city || cost === undefined) {
      return res.status(400).json({ 
        status: "error", 
        message: "city and cost are required" 
      });
    }

    await run(
      `INSERT INTO shipping_rules (city, cost) VALUES (?, ?)
       ON CONFLICT(city) DO UPDATE SET cost = excluded.cost`,
      [city, cost]
    );

    const rule = await get("SELECT * FROM shipping_rules WHERE city = ?", [city]);
    
    res.status(200).json({ 
      status: "success", 
      data: rule 
    });
  } catch (error) {
    next(error);
  }
};

const getShippingRules = async (req, res, next) => {
  try {
    const rules = await all("SELECT * FROM shipping_rules ORDER BY city ASC");
    
    res.status(200).json({ 
      status: "success", 
      data: rules 
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  upsertShippingRule,
  getShippingRules,
};
