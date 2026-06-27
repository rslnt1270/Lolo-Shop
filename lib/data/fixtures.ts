import type { Location, Product } from "@/lib/domain/types";

export const fixtureLocations: Location[] = [
  { id: "loc-1", name: "Tienda 1" },
  { id: "loc-2", name: "Tienda 2" },
];

export const fixtureProducts: Product[] = [
  {
    id: "prod-1",
    title: "Hoodie NY Yankees",
    category: "Hoodies",
    brand: "NY Yankees",
    imageUrl: null,
    variants: [
      {
        id: "var-1",
        sku: "LS-HOO-NYY-M-NEG",
        title: "M / Negro",
        size: "M",
        color: "Negro",
        price: 450,
        barcode: null,
        inventory: [
          { locationId: "loc-1", available: 3 },
          { locationId: "loc-2", available: 5 },
        ],
      },
      {
        id: "var-2",
        sku: "LS-HOO-NYY-L-NEG",
        title: "L / Negro",
        size: "L",
        color: "Negro",
        price: 450,
        barcode: null,
        inventory: [
          { locationId: "loc-1", available: 1 },
          { locationId: "loc-2", available: 0 },
        ],
      },
    ],
  },
  {
    id: "prod-2",
    title: "Playera Guess",
    category: "Playeras",
    brand: "Guess",
    imageUrl: null,
    variants: [
      {
        id: "var-3",
        sku: "LS-PLA-GUE-M-BLA",
        title: "M / Blanco",
        size: "M",
        color: "Blanco",
        price: 320,
        barcode: "7501234567890",
        inventory: [
          { locationId: "loc-1", available: 8 },
          { locationId: "loc-2", available: 2 },
        ],
      },
    ],
  },
];
