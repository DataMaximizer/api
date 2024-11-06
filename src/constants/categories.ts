interface Category {
	name: string;
	subcategories: string[];
}

export const PREDEFINED_CATEGORIES = [
	"Electronics",
	"Fashion & Accessories",
	"Health & Beauty",
	"Home & Garden",
	"Sports & Fitness",
	"Books & Education",
	"Software & Apps",
	"Digital Products",
	"Food & Beverages",
	"Toys & Games",
	"Pet Supplies",
	"Automotive",
	"Arts & Crafts",
	"Baby & Kids",
	"Business Services",
	"Travel & Leisure",
] as string[];

export const CATEGORY_HIERARCHY: Record<string, Category> = {
	electronics: {
		name: "Electronics",
		subcategories: [
			"Smartphones",
			"Laptops & Computers",
			"Audio & Headphones",
			"Gaming",
			"Cameras",
			"TVs",
			"Wearables",
			"Computer Accessories",
		],
	},
	fashionAccessories: {
		name: "Fashion & Accessories",
		subcategories: [
			"Men's Clothing",
			"Women's Clothing",
			"Kids' Fashion",
			"Shoes",
			"Bags",
			"Jewelry",
			"Watches",
			"Accessories",
		],
	},
	healthBeauty: {
		name: "Health & Beauty",
		subcategories: [
			"Skincare",
			"Makeup",
			"Hair Care",
			"Fragrances",
			"Personal Care",
			"Health Supplements",
			"Medical Supplies",
			"Wellness",
		],
	},
	homeGarden: {
		name: "Home & Garden",
		subcategories: [
			"Furniture",
			"Kitchen & Dining",
			"Home Decor",
			"Bedding",
			"Garden & Outdoor",
			"Storage & Organization",
			"Home Improvement",
			"Appliances",
		],
	},
	sportsFitness: {
		name: "Sports & Fitness",
		subcategories: [
			"Exercise Equipment",
			"Sports Gear",
			"Activewear",
			"Outdoor Recreation",
			"Fitness Accessories",
			"Sports Nutrition",
			"Team Sports",
			"Water Sports",
		],
	},
	booksEducation: {
		name: "Books & Education",
		subcategories: [
			"Physical Books",
			"eBooks",
			"Audiobooks",
			"Online Courses",
			"Educational Materials",
			"Study Tools",
			"Language Learning",
			"Professional Development",
		],
	},
	softwareApps: {
		name: "Software & Apps",
		subcategories: [
			"Business Software",
			"Security & Antivirus",
			"Design Tools",
			"Mobile Apps",
			"Productivity Tools",
			"Development Tools",
			"Gaming Software",
			"Cloud Services",
		],
	},
	digitalProducts: {
		name: "Digital Products",
		subcategories: [
			"Templates",
			"Graphics & Design",
			"Digital Art",
			"Music & Audio",
			"Video Content",
			"Website Themes",
			"Digital Downloads",
			"Subscriptions",
		],
	},
	foodBeverages: {
		name: "Food & Beverages",
		subcategories: [
			"Gourmet Food",
			"Beverages",
			"Snacks",
			"Organic & Natural",
			"Specialty Foods",
			"Wine & Spirits",
			"Coffee & Tea",
			"Supplements",
		],
	},
	toysGames: {
		name: "Toys & Games",
		subcategories: [
			"Board Games",
			"Educational Toys",
			"Action Figures",
			"Puzzles",
			"Arts & Crafts",
			"Electronic Toys",
			"Outdoor Toys",
			"Collectibles",
		],
	},
	petSupplies: {
		name: "Pet Supplies",
		subcategories: [
			"Dog Supplies",
			"Cat Supplies",
			"Pet Food",
			"Pet Health",
			"Pet Accessories",
			"Pet Toys",
			"Grooming",
			"Aquariums",
		],
	},
	automotive: {
		name: "Automotive",
		subcategories: [
			"Car Parts",
			"Car Electronics",
			"Car Care",
			"Tools & Equipment",
			"Motorcycle Parts",
			"Accessories",
			"GPS & Navigation",
			"Safety Equipment",
		],
	},
	artsCrafts: {
		name: "Arts & Crafts",
		subcategories: [
			"Art Supplies",
			"Crafting Tools",
			"Fabric & Sewing",
			"Paper Crafts",
			"Jewelry Making",
			"Painting Supplies",
			"Drawing",
			"Scrapbooking",
		],
	},
	babyKids: {
		name: "Baby & Kids",
		subcategories: [
			"Baby Gear",
			"Baby Care",
			"Feeding",
			"Diapering",
			"Kids Furniture",
			"Toys & Activities",
			"Children's Clothing",
			"School Supplies",
		],
	},
	businessServices: {
		name: "Business Services",
		subcategories: [
			"Marketing Services",
			"Financial Services",
			"Consulting",
			"Professional Training",
			"Office Supplies",
			"Business Software",
			"Printing Services",
			"Business Equipment",
		],
	},
	travelLeisure: {
		name: "Travel & Leisure",
		subcategories: [
			"Travel Gear",
			"Luggage",
			"Outdoor Equipment",
			"Travel Accessories",
			"Camping Gear",
			"Travel Services",
			"Recreation Equipment",
			"Adventure Gear",
		],
	},
};

export const getAllCategories = () => {
	return Object.values(CATEGORY_HIERARCHY).map((category) => ({
		main: category.name,
		sub: category.subcategories,
	}));
};

export const flattenedCategories = () => {
	const flattened: string[] = [];
	Object.values(CATEGORY_HIERARCHY).forEach((category) => {
		flattened.push(category.name);
		flattened.push(...category.subcategories);
	});
	return flattened;
};
