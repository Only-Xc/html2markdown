import BookWorkspace from "@/components/books/BookWorkspace";

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  return <BookWorkspace bookId={bookId} />;
}
