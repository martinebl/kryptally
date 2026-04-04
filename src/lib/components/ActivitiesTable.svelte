<script lang="ts">
    import type { Transaction } from "$lib/types";


    interface Props {
        transactions: Transaction[] 
    };

    let { transactions }: Props = $props();
    let sortedTransactions = $derived(
        [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime())
    );

    const typeBadgeClass = (type: string) => {
        const map: Record<string, string> = {
            transfer: 'bg-gray-100 text-gray-700',
            buy: 'bg-green-100 text-green-700',
            sell: 'bg-red-100 text-red-700',
            trade: 'bg-purple-100 text-purple-700',
            fee: 'bg-amber-100 text-amber-700',
            mining: 'bg-blue-100 text-blue-700',
            staking: 'bg-blue-100 text-blue-700',
            airdrop: 'bg-teal-100 text-teal-700',
        };
        return map[type] ?? 'bg-gray-100 text-gray-700';
    };

    const txAsset = (tx: Transaction) => tx.toAsset ?? tx.fromAsset ?? tx.feeAsset ?? '—';
    const txAmount = (tx: Transaction) => tx.toAmount ?? tx.fromAmount ?? tx.feeAmount;
    const txDirection = (tx: Transaction) => tx.toAmount ? '+' : tx.fromAmount ? '-' : '';
    const isTrade = (tx: Transaction) => tx.type === 'trade' && tx.fromAsset && tx.toAsset;
</script>

<h3 class="mb-4 font-heading text-lg font-medium text-text-heading">All Activity</h3>
<div class="overflow-x-auto rounded-xl border border-border">
    <table class="w-full text-left text-sm">
        <thead>
            <tr class="border-b border-border bg-bg-card text-xs uppercase tracking-wide text-text">
            <th class="px-4 py-3">Date</th>
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Asset</th>
            <th class="px-4 py-3 text-right">Amount</th>
            <th class="px-4 py-3 text-right">Fee</th>
            <th class="px-4 py-3">Source</th>
            </tr>
        </thead>
        <tbody>
            {#each sortedTransactions as tx}
            {@const amount = txAmount(tx)}
            <tr class="border-b border-border last:border-none hover:bg-bg-card/50">
                <td class="px-4 py-3 font-mono text-text-heading">
                {tx.date.toISOString().slice(0, 10)}
                </td>
                <td class="px-4 py-3">
                <span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium {typeBadgeClass(tx.type)}">
                    {tx.type}
                </span>
                </td>
                <td class="px-4 py-3 font-medium text-text-heading">
                {#if isTrade(tx)}
                    <span class="text-red-500">{tx.fromAsset}</span>
                    <span class="text-text mx-1">→</span>
                    <span class="text-green-600">{tx.toAsset}</span>
                {:else}
                    {txAsset(tx)}
                {/if}
                </td>
                <td class="px-4 py-3 text-right font-mono text-text-heading">
                {#if isTrade(tx)}
                    <span class="text-red-500">-{tx.fromAmount?.toFormat(8)}</span>
                    <span class="text-text mx-1">/</span>
                    <span class="text-green-600">+{tx.toAmount?.toFormat(8)}</span>
                {:else if amount}
                    <span class={txDirection(tx) === '+' ? 'text-green-600' : txDirection(tx) === '-' ? 'text-red-500' : ''}>
                    {txDirection(tx)}{amount.toFormat(8)}
                    </span>
                {:else}
                    —
                {/if}
                </td>
                <td class="px-4 py-3 text-right font-mono text-text">
                {#if tx.feeAmount && tx.feeAmount.gt(0)}
                    {tx.feeAmount.toFormat(8)} {tx.feeAsset}
                {:else}
                    —
                {/if}
                </td>
                <td class="px-4 py-3 text-text">{tx.exchange ?? '—'}</td>
            </tr>
            {/each}
        </tbody>
    </table>
</div>