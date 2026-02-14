// Formatting utilities

const Format = {
    // Convert kg to stones and pounds
    kgToStones(kg) {
        const totalPounds = kg * 2.20462;
        const stones = Math.floor(totalPounds / 14);
        const pounds = Math.round(totalPounds % 14);
        return { stones, pounds };
    },

    // Convert stones and pounds to kg
    stonesToKg(stones, pounds) {
        const totalPounds = (stones * 14) + pounds;
        return totalPounds / 2.20462;
    },

    // Format weight for display
    formatWeight(kg, unit) {
        if (unit === 'kg') {
            return `${kg.toFixed(1)} kg`;
        } else {
            const { stones, pounds } = this.kgToStones(kg);
            return `${stones}st ${pounds}lb`;
        }
    },

    // Format calories
    formatCalories(cals) {
        return Math.round(cals).toLocaleString();
    },

    // Format number with sign
    formatWithSign(num) {
        const rounded = Math.round(num);
        if (rounded > 0) return `+${rounded}`;
        return rounded.toString();
    }
};
