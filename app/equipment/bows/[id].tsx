import { useMemo } from 'react';

import { EquipmentAdapter, EquipmentScreen } from '@/components/equipment-screen';
import type { components } from '@/lib/api-types';
import { errorMessage, useAuth } from '@/lib/auth';
import { BOW_FIELDS } from '@/lib/equipment-fields';

type Body = components['schemas']['BowRequest'];

export default function BowScreen() {
  const { api } = useAuth();
  const adapter = useMemo<EquipmentAdapter>(
    () => ({
      load: async (id) => (await api.GET('/api/bows/{id}/', { params: { path: { id } } })).data ?? null,
      revisions: async (id) =>
        (await api.GET('/api/bows/{id}/revisions/', { params: { path: { id } } })).data ?? [],
      create: async (payload) => {
        const { data, error } = await api.POST('/api/bows/', { body: payload as Body });
        return data ? null : errorMessage(error);
      },
      update: async (id, payload) => {
        const { data, error } = await api.PATCH('/api/bows/{id}/', { params: { path: { id } }, body: payload });
        return data ? null : errorMessage(error);
      },
      remove: async (id) => {
        const { response, error } = await api.DELETE('/api/bows/{id}/', { params: { path: { id } } });
        return response.ok ? null : errorMessage(error);
      },
    }),
    [api],
  );
  return <EquipmentScreen label="bow" fields={BOW_FIELDS} adapter={adapter} />;
}
