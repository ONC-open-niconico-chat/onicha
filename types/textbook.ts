export type Textbook = {
  id: string;
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  pub_year: string;
};

// 画面表示（結合データ）用の型
export type SearchResultItem = {
  id: string;
  textbook_id?: number;
  course_name: string;
  professor_name: string;
  schedule: string;
  textbook_title: string;
  edition: string;
};