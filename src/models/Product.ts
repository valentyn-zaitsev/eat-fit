export interface Product {
  id?: number;
  name: string;
  calories: number;  // per 100g
  protein: number;   // per 100g
  fat: number;       // per 100g
  carbs: number;     // per 100g
  created_at?: string;
}

export interface MacroResult {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

/** Calculate macros for a given weight (grams) of a product */
export const calculateMacros = (product: Product, weightGrams: number): MacroResult => {
  const factor = weightGrams / 100;
  return {
    calories: Math.round(product.calories * factor * 10) / 10,
    protein:  Math.round(product.protein  * factor * 10) / 10,
    fat:      Math.round(product.fat      * factor * 10) / 10,
    carbs:    Math.round(product.carbs    * factor * 10) / 10,
  };
};

/** Sum multiple MacroResults */
export const sumMacros = (macros: MacroResult[]): MacroResult => {
  return macros.reduce(
    (acc, m) => ({
      calories: Math.round((acc.calories + m.calories) * 10) / 10,
      protein:  Math.round((acc.protein  + m.protein)  * 10) / 10,
      fat:      Math.round((acc.fat      + m.fat)      * 10) / 10,
      carbs:    Math.round((acc.carbs    + m.carbs)    * 10) / 10,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
};
