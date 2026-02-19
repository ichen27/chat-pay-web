'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import ConversationList from '@/components/ConversationList';
import ChatView from '@/components/ChatView';
import PaymentModal from '@/components/PaymentModal';

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(undefined);
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-800" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <ConversationList
        selectedId={selectedConversationId}
        onSelect={setSelectedConversationId}
      />
      {selectedConversationId ? (
        <div className="flex-1">
          <ChatView
            conversationId={selectedConversationId}
            currentUserId={user.id}
            onShowPayment={() => setShowPayment(true)}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-500">
          Select a conversation
        </div>
      )}
      {showPayment && (
        <PaymentModal
          conversationId={selectedConversationId ?? ''}
          senderBalance={user.balance ?? 0}
          onClose={() => setShowPayment(false)}
          onSuccess={() => setShowPayment(false)}
        />
      )}
    </div>
  );
}
