// @flow
import getDraggablesInsideDroppable from '../get-draggables-inside-droppable';
import { patch, subtract, negate } from '../position';
import withDroppableDisplacement from '../with-droppable-displacement';
import isTotallyVisibleInNewLocation from './is-totally-visible-in-new-location';
import getViewport from '../../window/get-viewport';
// import getScrollJumpResult from './get-scroll-jump-result';
import moveToEdge from '../move-to-edge';
import getDisplacement from '../get-displacement';
import type { Edge } from '../move-to-edge';
import type { Args, Result } from './move-to-next-index-types';
import type {
  DraggableLocation,
  DraggableDimension,
  Position,
  Displacement,
  Axis,
  DragImpact,
  Area,
} from '../../types';

export default ({
  isMovingForward,
  draggableId,
  previousPageCenter,
  previousImpact,
  droppable,
  draggables,
}: Args): ?Result => {
  const location: ?DraggableLocation = previousImpact.destination;

  if (!location) {
    console.error('cannot move to next index when there is not previous destination');
    return null;
  }

  const draggable: DraggableDimension = draggables[draggableId];
  const axis: Axis = droppable.axis;

  const insideDroppable: DraggableDimension[] = getDraggablesInsideDroppable(
    droppable,
    draggables,
  );

  const startIndex: number = draggable.descriptor.index;
  const currentIndex: number = location.index;
  const proposedIndex = isMovingForward ? currentIndex + 1 : currentIndex - 1;

  if (startIndex === -1) {
    console.error('could not find draggable inside current droppable');
    return null;
  }

  // cannot move forward beyond the last item
  if (proposedIndex > insideDroppable.length - 1) {
    return null;
  }

  // cannot move before the first item
  if (proposedIndex < 0) {
    return null;
  }

  const viewport: Area = getViewport();
  const destination: DraggableDimension = insideDroppable[proposedIndex];
  const isMovingTowardStart = (isMovingForward && proposedIndex <= startIndex) ||
    (!isMovingForward && proposedIndex >= startIndex);

  const edge: Edge = (() => {
    // is moving away from the start
    if (!isMovingTowardStart) {
      return isMovingForward ? 'end' : 'start';
    }
    // is moving back towards the start
    return isMovingForward ? 'start' : 'end';
  })();

  const newPageCenter: Position = moveToEdge({
    source: draggable.page.withoutMargin,
    sourceEdge: edge,
    destination: destination.page.withoutMargin,
    destinationEdge: edge,
    destinationAxis: droppable.axis,
  });

  // Calculate DragImpact
  // at this point we know that the destination is droppable
  const destinationDisplacement: Displacement = {
    draggableId: destination.descriptor.id,
    isVisible: true,
    shouldAnimate: true,
  };

  const modified: Displacement[] = (isMovingTowardStart ?
    // remove the most recently impacted
    previousImpact.movement.displaced.slice(1, previousImpact.movement.displaced.length) :
    // add the destination as the most recently impacted
    [destinationDisplacement, ...previousImpact.movement.displaced]);

  // update impact with visibility - stops redundant work!
  const displaced: Displacement[] = modified
    .map((displacement: Displacement): Displacement => {
      // we have already calculated the displacement for this item
      if (displacement === destinationDisplacement) {
        return displacement;
      }

      const updated: Displacement = getDisplacement({
        draggable: draggables[displacement.draggableId],
        destination: droppable,
        previousImpact,
        viewport,
      });

      return updated;
    });

  const newImpact: DragImpact = {
    movement: {
      displaced,
      // The amount of movement will always be the size of the dragging item
      amount: patch(axis.line, draggable.page.withMargin[axis.size]),
      isBeyondStartPosition: proposedIndex > startIndex,
    },
    destination: {
      droppableId: droppable.descriptor.id,
      index: proposedIndex,
    },
    direction: droppable.axis.direction,
  };

  const isVisibleInNewLocation: boolean = isTotallyVisibleInNewLocation({
    draggable,
    destination: droppable,
    newPageCenter,
    viewport,
  });

  if (isVisibleInNewLocation) {
    return {
      pageCenter: withDroppableDisplacement(droppable, newPageCenter),
      impact: newImpact,
      scrollJumpRequest: null,
    };
  }

  // The full distance required to get from the previous page center to the new page center
  const requiredDistance: Position = subtract(newPageCenter, previousPageCenter);
  const requiredScroll: Position = withDroppableDisplacement(droppable, requiredDistance);

  return {
    pageCenter: previousPageCenter,
    impact: newImpact,
    scrollJumpRequest: requiredScroll,
  };
};
