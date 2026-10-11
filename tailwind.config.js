module.exports = {
  content: ['./public/**/*.html', './public/assets/js/*.js', './views/*.html'],
  theme: {
    extend: {
      colors: {
        olive: { 50:'#F4F6F3',100:'#E6ECE4',200:'#CDD9CA',300:'#ADBEA9',400:'#8DA385',500:'#526E4D',600:'#435C3E',700:'#354A31',800:'#2B332B',900:'#1B231B',950:'#0F150F' },
        champagne: { 400:'#D9B772', 500:'#C5A059', 600:'#A8823B', 700:'#876520' },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
