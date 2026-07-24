const formatLocalDate = date => {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const createInitialReportBasicInfo = (
    fields,
    today = formatLocalDate(new Date())
) => {
    if (!Array.isArray(fields)) return {};
    const localDate = typeof today === 'string' ? today : formatLocalDate(today);
    return Object.fromEntries(
        fields
            .filter(field => typeof field?.key === 'string' && field.key.trim())
            .map(field => [
                field.key,
                field.type === 'date' ? localDate : ''
            ])
    );
};

module.exports = {
    createInitialReportBasicInfo,
    formatLocalDate
};
