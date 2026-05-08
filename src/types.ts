export type AppTab = 'chat' | 'recipes' | 'records' | 'settings' | 'shopping';

export type Ingredient = {
  name: string;
  amount: string;
  icon?: string;
};

export type Recipe = {
  id: string;
  title: string;
  category: string;
  description: string;
  imageUrl: string;
  ingredients: Ingredient[];
  steps: string[];
};

export type ShoppingItem = {
  id: string;
  name: string;
  category: string;
  isPurchased: boolean;
  suggestedWeek: number;
};
