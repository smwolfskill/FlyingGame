/* @author      Scott Wolfskill, wolfski2
 * @created     05/02/17
 * @last edit   05/02/17  */
/* This file is for sphere physics interactions, such as
 * setting and updating Position, Velocity, and Acceleration, 
 * and performing collision detection.
 * The 2 main workhorses are the Sphere and SphereList (linked list of Spheres) classes.
 */

var gravityA = [0.0, -1.0, 0.0]; //Default acceleration due to gravity (scaled down since it was way too fast)
var drag = 0.2; //sphere drag thru air. Know < 1, but might need fine-tuning.

class Sphere {
    constructor(radius, position, velocity, acceleration=gravityA) {
        this.radius = radius;
        this.position = position;
        this.velocity = velocity;
        this.acceleration = acceleration;
        this.next = null;
    }
    
    toString() {
        var retStr = "Sphere(" + this.position.toString() + "; " + this.velocity.toString() + "; " + this.acceleration.toString() + "; ";
        if(this.next == null) return retStr + "null)";
        return retStr + "(Sphere))";
    }
}

class SphereList { //sphere linked list
    constructor() {
        this.head = null;
        this.tail = null;
        this.length = 0;
    }
    
    add(sphere) {
        if(this.head == null) {
            this.head = sphere;
        } else {
            this.tail.next = sphere;
        }
        this.tail = sphere;
        this.length++;
    }
    
    add_(radius, position, velocity, acceleration=gravityA) {
        this.add(new Sphere(radius, position, velocity, acceleration));
    }
    
    delete(previous, current) { //delete (current), but need (previous) for bookkeeping.
        if(previous == null) this.head = current.next; //we deleted head
        else {
            previous.next = current.next;
        }
        if(current.next == null) this.tail = previous; //we deleted tail
        this.length--;
        return current.next;
    }
    
    toString() {
        var retStr = "SphereList(";
        if(this.head == null) retStr += "null; null; ";
        else {
            var curSphere = this.head;
            while(curSphere != null) {
                retStr += curSphere.toString() + "; ";
                curSphere = curSphere.next;
            }
        }
        return retStr + this.length.toString() + ")";
    }
}

/**
 * Generate and return a random float in the range [a, b).
 * @param {float} a Lower bound for the range
 * @param {float} b Upper bound for the range
 */
function randFloatInRange(a, b) {
    //bring [0, 1) -> [a, b): [0, 1) -> [0, b-a) -> [a, b)
    return ((Math.random() * (b - a)) + a);
}

/**
 * Create any number of spheres with random velocities and positions within certain ranges.
 * @param {int} numSpheres Number of spheres to be generated.
 * @param {float} radius Sphere radius
 * @param {Array} positionBounds 6-length Array in format [lowXBound, highXBound, lowYBound, ...]. Position values will be in these ranges.
 * @param {Array} velocityBounds 6-length Array in format [lowXBound, highXBound, lowYBound, ...]. Velocity values will be in these ranges.
 * @param {SphereList} sphereList Existing SphereList to add the new spheres to, if desired. If not set, will return a new sphereList.
 * @param {Array} sphereA Acceleration. If undefined, will use default acceleration due to gravity.
 * @return {SphereList}
 */
function createSpheres(numSpheres, radius, positionBounds, velocityBounds, sphereList, sphereA) {
    if(typeof(sphereList)==='undefined' || sphereList == null) sphereList = new SphereList();
    if(typeof(sphereA)==='undefined') sphereA = gravityA;
    for(var i = 0; i < numSpheres; i++) {
        var position = new Array(3);
        var velocity = new Array(3);
        //Generate current sphere initial position.
        for(var p = 0; p < 3; p++) {
            position[p] = randFloatInRange(positionBounds[2*p], positionBounds[2*p+1]);
        }
        //Generate current sphere initial velocity.
        for(var v = 0; v < 3; v++) {
            velocity[v] = randFloatInRange(velocityBounds[2*v], velocityBounds[2*v+1]);
        }
        sphereList.add_(radius, position, velocity, sphereA);
    }
    return sphereList;
}

/**
 * Update the Position and Velocity of all spheres in a SphereList due to their Acceleration, universal Drag, and time elapsed.
 * Deletes spheres below the minY threshold, and performs collision detection.
 * @param {SphereList} sphereList SphereList of all spheres that we want to update.
 * @param {Number} timeElapsed Time in milliseconds since these PVA values were last set/updated
 * @param {float} minY Minimum y-value that spheres should still exist on; if one has crossed lower than this threshold it is deleted.
 * @param {Array} colliderPosition 3-length Array of the position that we're checking for a collision with any of the spheres
 * @param {float} tolerance Amount to increase the radius by as tolerance to make collision detection easier to achieve
 * @param {bool} deleteCollisions If true, deletes all spheres that object at colliderPosition collided with.
 * @param {bool} reverseGravity If true, invert acceleration (typically gravity)
 * @return {int} Number of spheres that some object at colliderPosition collided with
 */
function updatePVA(sphereList, timeElapsed, minY, colliderPosition, tolerance, deleteCollisions = true, reverseGravity = false) {
    timeElapsed = timeElapsed / 1000; //set to seconds
    var dragTime = Math.pow(drag, timeElapsed); //drag ^ timeElapsed
    var accelMultiplier = 1.0; //invert acceleration if reverseGravity
    if(reverseGravity) accelMultiplier = -1.0;
    
    var collisions = 0;
    var prev = null;
    var curSphere = sphereList.head;
    while(curSphere != null) {
        //1. Update position: P += V*t
        for(var i = 0; i < 3; i++) {
            curSphere.position[i] += curSphere.velocity[i] * timeElapsed;
        }
        //2. Perform position checks
        //2.1 Check y-value for threshold
        if(curSphere.position[1] < minY) { //delete
            curSphere = sphereList.delete(prev, curSphere);
            continue;
        }
        //2.2 Collision detection
        if(collisionDetection(curSphere, colliderPosition, tolerance)) {
            collisions++;
            if(deleteCollisions) {
                curSphere = sphereList.delete(prev, curSphere);
                continue;
            }
        }
        //3. If 2) passes: Update velocity: V = V*d^t + A*t
        for(var i = 0; i < 3; i++) {
            curSphere.velocity[i] = curSphere.velocity[i] * dragTime + accelMultiplier * curSphere.acceleration[i] * timeElapsed;
        }
        prev = curSphere;
        curSphere = curSphere.next;
    }
    return collisions;
}

/**
 * Perform collision detection between a sphere and a point.
 * @param {Sphere} sphere Sphere to do collision detection on.
 * @param {Array} colliderPosition 3-length Array of the position that we're checking for a collision with any of the spheres
 * @param {float} tolerance Amount to increase the radius by as tolerance to make collision detection easier to achieve
 * @return {bool} Whether or not object at colliderPosition collided with this sphere
 */
function collisionDetection(sphere, colliderPosition, tolerance) {
    for(var i = 0; i < 3; i++) {
        if(colliderPosition[i] < (sphere.position[i] - sphere.radius - tolerance) || colliderPosition[i] > (sphere.position[i] + sphere.radius + tolerance))  {
            //In the i'th spatial dimension, colliderPosition is not within the sphere. So no collision.
            return false;
        }
    }
    return true; //colliderPosition was within the sphere in all dimensions
}