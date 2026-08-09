import { redirect } from 'next/navigation';

export default async function WorkspaceIndex({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  redirect(`/workspaces/${workspaceId}/jobs`);
}
