/** EXEF Router - URL-based navigation system */
class Router {
    constructor() {
        this.routes = new Map();
        this.currentView = null;
        this.currentParams = {};
        this.init();
    }
    
    init() {
        window.addEventListener('popstate', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }
    
    register(path, component) {
        this.routes.set(path, component);
    }
    
    navigate(path, params = {}) {
        const url = new URL(window.location);
        url.search = new URLSearchParams(params).toString();
        url.pathname = path;
        
        window.history.pushState(
            { path, params }, 
            '', 
            url.toString()
        );
        
        this.handleRoute();
    }
    
    handleRoute() {
        const url = new URL(window.location);
        const path = url.pathname || '/';
        const params = Object.fromEntries(url.searchParams);
        
        // Find matching route
        let component = this.routes.get(path);
        
        // If no exact match, try to find pattern
        if (!component) {
            for (const [routePath, routeComponent] of this.routes) {
                if (this.matchPath(routePath, path)) {
                    component = routeComponent;
                    break;
                }
            }
        }
        
        if (component) {
            this.currentView = component;
            this.currentParams = params;
            this.render();
        }
    }
    
    matchPath(routePath, actualPath) {
        // Simple pattern matching - can be extended
        if (routePath.includes(':')) {
            const routeParts = routePath.split('/');
            const actualParts = actualPath.split('/');
            
            if (routeParts.length !== actualParts.length) return false;
            
            return routeParts.every((part, i) => 
                part.startsWith(':') || part === actualParts[i]
            );
        }
        
        return routePath === actualPath;
    }
    
    render() {
        // This would be handled by Alpine.js in our case
        if (window.appInstance) {
            window.appInstance.view = this.currentParams.view || 'profiles';
            window.appInstance.profileId = this.currentParams.profile || 'default';
            window.appInstance.docId = this.currentParams.id || null;
        }
    }
}

// Global router instance
window.router = new Router();
