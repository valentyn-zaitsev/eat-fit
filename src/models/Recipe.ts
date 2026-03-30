export interface Recipe {
  id?: number;
  name: string;
  created_at?: string;
}

export interface RecipeIngredient {
  id?: number;
  recipe_id: number;
  product_id: number;
  ingredient_weight: number;
  sort_order: number;
  // Joined fields (optional, from queries)
  product_name?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
}
