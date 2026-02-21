declare const products: {
    id: number;
    name: string;
    category: string;
    sku: string;
    unit_price: number;
    supplier: string;
    description: string;
}[];
declare const inventory: {
    id: number;
    product_id: number;
    warehouse_id: number;
    quantity_on_hand: number;
    reorder_point: number;
}[];
declare const warehouses: {
    id: number;
    name: string;
    location: string;
}[];
declare const router: import("express-serve-static-core").Router;
export { inventory, products, warehouses };
export default router;
//# sourceMappingURL=inventory-simple.d.ts.map