module.exports = {
    convertTime: function (duration) {
        const hours = Math.floor(duration / 3600000).toString().padStart(2, '0');
        const minutes = Math.floor((duration % 3600000) / 60000).toString().padStart(2, '0');
        const seconds = Math.floor((duration % 60000) / 1000).toString().padStart(2, '0');

        return duration < 3600000 ? `${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
    },

    convertNumber: function (number, decPlaces) {
        const abbrev = ['', 'K', 'M', 'B', 'T'];
        const decimalPlaces = Math.pow(10, decPlaces);

        for (let i = abbrev.length - 1; i > 0; i--) {
            const size = Math.pow(10, i * 3);
            if (size <= number) {
                number = Math.round((number * decimalPlaces) / size) / decimalPlaces;
                if (number === 1000 && i < abbrev.length - 1) {
                    number = 1;
                    i++;
                }
                return number + abbrev[i];
            }
        }

        return number.toString();
    },

    chunk: function (arr, size) {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
        );
    },

    convertHmsToMs: function (hms) {
        const parts = hms.split(':').map(Number);
        const [seconds, minutes = 0, hours = 0] = parts.reverse();
        return ((hours * 60 + minutes) * 60 + seconds) * 1000;
    }
};