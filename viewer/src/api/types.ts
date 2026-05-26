export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type AuthMe = {
  id: number;
  login: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
};

export type SubjectListItem = {
  slug: string;
  name: string;
  description: string | null;
  language: string;
  latest_version: string | null;
  content_type: string;
};

export type VersionListItem = {
  version_label: string;
  schema_version: string;
  uploaded_at: number;
};

export type Addendum = {
  id: number;
  question: string;
  answer: string | null;
  created_at: number;
  author_login: string;
};

export type SearchHit = {
  doc_type: string;
  doc_id: string;
  snippet: string;
};
