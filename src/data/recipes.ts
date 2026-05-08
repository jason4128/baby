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

export const initialRecipes: Recipe[] = [
  {
    id: '1',
    title: '紙包鮮蝦時蔬',
    category: '烤箱懶人食譜',
    description: '利用烘焙紙包覆食材，能完美鎖住蝦仁與蔬菜的水分，不需顧火，快速又健康。',
    imageUrl: 'https://images.unsplash.com/photo-1625944230945-1b7dd12a80f2?q=80&w=800&auto=format&fit=crop',
    ingredients: [
      { name: '生凍大白蝦', amount: '4-5 隻', icon: '🦐' },
      { name: '綠花椰菜', amount: '半朵', icon: '🥦' },
      { name: '黃椒/紅椒', amount: '少許', icon: '🫑' },
      { name: '蒜末', amount: '1 小匙', icon: '🧄' },
      { name: '橄欖油', amount: '1 大匙', icon: '🫒' },
      { name: '鹽巴與黑胡椒', amount: '少許', icon: '🧂' }
    ],
    steps: [
      '前置作業：蝦仁流水解凍或剝殼去腸泥。蔬菜洗淨切成一口大小。',
      '鋪設紙包：取一大張烘焙紙，將蔬菜墊底，上面鋪上蝦仁。',
      '調味點綴：均勻撒上蒜末、鹽巴、黑胡椒，最後淋上橄欖油。',
      '包裝封口：將烘焙紙兩側往上折，邊緣像糖果紙一樣捲緊密封，防止水氣跑出。',
      '進爐烘烤：放入預熱好的烤箱，設定 200度 烤 12-15 分鐘。',
      '盛盤享用：小心打開紙包（注意蒸氣燙手），即可連同鮮甜湯汁一起享用！'
    ]
  },
  {
    id: '2',
    title: '日式豆腐雞肉漢堡排',
    category: '微波/平底鍋',
    description: '熱量低且富含優質蛋白，一次做多片冷凍起來，隨時淋上照燒醬或胡麻醬就是主菜。',
    imageUrl: 'https://images.unsplash.com/photo-1529042410759-befb1204b468?q=80&w=800&auto=format&fit=crop',
    ingredients: [
      { name: '雞胸絞肉', amount: '200g', icon: '🥩' },
      { name: '板豆腐', amount: '100g', icon: '🧊' },
      { name: '洋蔥丁', amount: '1/4 顆', icon: '🧅' },
      { name: '日式醬油', amount: '1 大匙', icon: '🍶' },
      { name: '鹽巴/胡椒', amount: '少許', icon: '🧂' }
    ],
    steps: [
      '豆腐去水：用廚房紙巾包住豆腐，壓重物 10 分鐘，或微波 1 分鐘擠乾水分。',
      '混合食材：絞肉與去水豆腐、洋蔥丁抓勻，加入日式醬油、鹽、胡椒調味。',
      '拍打塑形：捏成圓扁平狀，雙手來回拍打把空氣擠出，比較不容易散開。',
      '定型煎香：鍋裡加少許油，兩面煎到金黃定型 (內部不需全熟)。',
      '冷凍保存：冷卻後用烘焙紙層疊隔開，裝入保鮮袋冷凍。',
      '快速上桌：要吃時拿出 1-2 片，微波 2 分鐘，淋上醬汁即可享用。'
    ]
  },
  {
    id: '3',
    title: '味噌鮭魚片',
    category: '適合烤箱',
    description: '鮭魚富含對胎兒發育很有幫助的 Omega-3，用簡單的味噌醃製就能帶出鮮甜。',
    imageUrl: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?q=80&w=800&auto=format&fit=crop',
    ingredients: [
      { name: '鮭魚片', amount: '1-2 片', icon: '🐟' },
      { name: '味噌', amount: '1 大匙', icon: '🥣' },
      { name: '味醂', amount: '1 小匙', icon: '🍯' },
      { name: '飲用水', amount: '少許', icon: '💧' }
    ],
    steps: [
      '調製醃料：將味噌、味醂與少許水拌勻成糊狀。',
      '塗抹鮭魚：用紙巾把鮭魚表面水分吸乾，均勻抹上味噌醬。',
      '冷凍保存：單片放入密封袋中冷凍保存。',
      '烘烤出爐：不需解凍，稍微刮掉表面多餘味噌(避免烤焦)，進烤箱 200度 烤 15 分鐘。'
    ]
  },
  {
    id: '4',
    title: '起司地瓜塊',
    category: '氣炸百搭',
    description: '地瓜的膳食纖維能幫助緩解孕期常見的消化問題，起司則增加鈣質補給。',
    imageUrl: 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?q=80&w=800&auto=format&fit=crop',
    ingredients: [
      { name: '黃肉地瓜', amount: '2 顆', icon: '🍠' },
      { name: '乳酪絲/起司條', amount: '適量', icon: '🧀' },
      { name: '橄欖油', amount: '少許', icon: '🫒' }
    ],
    steps: [
      '切塊蒸熟：地瓜洗淨去皮，切成適口大小的滾刀塊，放入電鍋蒸熟。',
      '冷卻裝袋：蒸熟的地瓜塊放涼後備用。',
      '撒起司冷凍：將地瓜塊鋪平，撒上起司絲，放入冷凍庫速凍定型。',
      '氣炸上桌：取出後噴少許橄欖油，氣炸鍋 180度 10 分鐘，外酥內軟。'
    ]
  }
];
