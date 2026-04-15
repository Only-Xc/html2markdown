import BookWorkspace from "@/components/books/BookWorkspace";

interface Props {
  params: Promise<{
    bookId: string;
  }>;
}

export default async function BookWorkspacePage({ params }: Props) {
  const { bookId } = await params;

  return <BookWorkspace bookId={bookId} />;
}
