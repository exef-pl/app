FROM nginx:alpine

# Copy all static files
COPY index.html styles.css router.js /usr/share/nginx/html/
COPY components/ /usr/share/nginx/html/components/

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
