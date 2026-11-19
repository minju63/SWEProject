import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { personalApi } from './api';
export function useNotifications() {
  const { user } = useAuth(),
    client = useQueryClient(),
    key = ['my-notifications', user?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => personalApi('/notifications'),
    enabled: !!user && !user.app_metadata?.registration_pending,
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always',
  });
  const read = useMutation({
    mutationFn: (id) => personalApi('/notifications/' + id + '/read', 'PUT', {}),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  return {
    ...query,
    items: query.data?.items || [],
    unreadCount: query.data?.unreadCount || 0,
    markRead: read.mutateAsync,
    marking: read.isPending,
    readError: read.error,
  };
}
