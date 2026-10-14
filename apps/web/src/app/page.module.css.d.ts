interface PageStyles {
  main: string;
  header: string;
  title: string;
  subtitle: string;
  section: string;
  sectionTitle: string;
  sectionHeader: string;
  viewAll: string;
  categoryList: string;
  categoryLink: string;
  productGrid: string;
  productCard: string;
  productImage: string;
  productInfo: string;
  productName: string;
  productBrand: string;
  productFooter: string;
  productPrice: string;
  addToCartBtn: string;
}

declare module './page.module.css' {
  const styles: PageStyles;
  export default styles;
}

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}